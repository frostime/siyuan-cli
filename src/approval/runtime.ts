import {
    chmodSync,
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    rmSync,
    statSync,
    unlinkSync,
    writeFileSync
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'pathe';
import { spawn } from 'node:child_process';
import { getConfigDir } from '../utils/paths.js';
import { ApprovalBrokerUnavailableError } from './errors.js';
import type { ApprovalResolvedBroker } from './types.js';

export const DEFAULT_REQUEST_TIMEOUT_SEC = 60;
export const QUEUE_EMPTY_GRACE_MS = 30_000;
export const HARD_IDLE_TIMEOUT_MS = 5 * 60_000;
export const BROKER_READY_TIMEOUT_MS = 5_000;
export const BROKER_START_LOCK_STALE_MS = 15_000;

export function getApprovalStateDir(): string {
    return join(getConfigDir(), 'runtime', 'approval');
}

export function getApprovalRequestsDir(): string {
    return join(getApprovalStateDir(), 'requests');
}

export function getApprovalAuditDir(): string {
    return join(getApprovalStateDir(), 'audit');
}

export function getApprovalBrokerPidFile(): string {
    return join(getApprovalStateDir(), 'broker.pid');
}

export function getApprovalBrokerPortFile(): string {
    return join(getApprovalStateDir(), 'broker-port.txt');
}

export function getApprovalBrokerTokenFile(): string {
    return join(getApprovalStateDir(), 'broker-token.txt');
}

export function getApprovalBrokerStartLockFile(): string {
    return join(getApprovalStateDir(), 'broker-start.lock');
}

export function ensureApprovalStateDirs(): void {
    mkdirSync(getApprovalRequestsDir(), { recursive: true });
    mkdirSync(getApprovalAuditDir(), { recursive: true });
}

function bestEffortChmod0600(path: string): void {
    try {
        chmodSync(path, 0o600);
    } catch {
        // Windows or unsupported FS
    }
}

function readIntegerFile(path: string): number | null {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
}

function readTextFile(path: string): string | null {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8').trim();
    return raw || null;
}

export function readBrokerPid(): number | null {
    return readIntegerFile(getApprovalBrokerPidFile());
}

export function readBrokerPort(): number | null {
    return readIntegerFile(getApprovalBrokerPortFile());
}

export function readBrokerToken(): string | null {
    return readTextFile(getApprovalBrokerTokenFile());
}

export function getBrokerBaseUrl(port: number): string {
    return `http://127.0.0.1:${port}`;
}

function removeIfExists(path: string): void {
    if (!existsSync(path)) return;
    try {
        unlinkSync(path);
    } catch {
        // best-effort cleanup
    }
}

export function cleanupApprovalBrokerState(): void {
    removeIfExists(getApprovalBrokerPidFile());
    removeIfExists(getApprovalBrokerPortFile());
    removeIfExists(getApprovalBrokerTokenFile());
}

export function cleanupStaleApprovalBrokerState(): void {
    const pid = readBrokerPid();
    if (pid === null) {
        cleanupApprovalBrokerState();
        return;
    }

    try {
        process.kill(pid, 0);
    } catch {
        cleanupApprovalBrokerState();
    }
}

export async function pingBroker(baseUrl: string): Promise<boolean> {
    try {
        const response = await fetch(`${baseUrl}/api/approval/status`, {
            signal: AbortSignal.timeout(1_000)
        });
        return response.ok;
    } catch {
        return false;
    }
}

function resolveCliEntry(): string {
    const explicit = process.env['SIYUAN_APPROVAL_CLI_ENTRY'];
    if (explicit) return explicit;
    const argv1 = process.argv[1];
    if (!argv1) {
        throw new ApprovalBrokerUnavailableError(
            'Cannot resolve the CLI entrypoint for starting the approval broker.'
        );
    }
    return argv1;
}

function createBrokerToken(): string {
    return randomBytes(24).toString('base64url');
}

function writeStartupLock(fd: number): void {
    try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), 'utf-8');
    } catch {
        // metadata is best-effort only
    }
}

function cleanupStaleStartLock(): void {
    const path = getApprovalBrokerStartLockFile();
    if (!existsSync(path)) return;
    const ageMs = Date.now() - statSync(path).mtimeMs;
    if (ageMs > BROKER_START_LOCK_STALE_MS) {
        removeIfExists(path);
    }
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireBrokerStartLock(
    timeoutMs = BROKER_READY_TIMEOUT_MS
): Promise<() => void> {
    ensureApprovalStateDirs();
    const path = getApprovalBrokerStartLockFile();
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        cleanupStaleStartLock();
        try {
            const fd = openSync(path, 'wx');
            writeStartupLock(fd);
            bestEffortChmod0600(path);
            return () => {
                try {
                    closeSync(fd);
                } catch {
                    // best-effort close
                }
                removeIfExists(path);
            };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'EEXIST') throw error;
        }
        await sleep(100);
    }

    throw new ApprovalBrokerUnavailableError(
        `Timed out acquiring the approval broker startup lock after ${timeoutMs}ms.`
    );
}

export async function spawnApprovalBroker(): Promise<void> {
    ensureApprovalStateDirs();
    cleanupStaleApprovalBrokerState();

    const cliEntry = resolveCliEntry();
    const child = spawn(
        process.execPath,
        [cliEntry, 'approval', 'broker', '--port', '0'],
        {
            detached: true,
            stdio: 'ignore',
            env: {
                ...process.env,
                SIYUAN_APPROVAL_BROKER: '1',
                SIYUAN_APPROVAL_CLI_ENTRY: cliEntry,
                SIYUAN_APPROVAL_BROKER_TOKEN: createBrokerToken()
            }
        }
    );
    child.unref();
}

export async function waitForApprovalBroker(
    timeoutMs = BROKER_READY_TIMEOUT_MS
): Promise<ApprovalResolvedBroker> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const port = readBrokerPort();
        const token = readBrokerToken();
        if (port !== null && token) {
            const baseUrl = getBrokerBaseUrl(port);
            if (await pingBroker(baseUrl)) {
                return { baseUrl, port, token };
            }
        }
        await sleep(100);
    }

    throw new ApprovalBrokerUnavailableError(
        `Approval broker did not become ready within ${timeoutMs}ms.`
    );
}

export async function getRunningBroker(): Promise<ApprovalResolvedBroker | null> {
    cleanupStaleApprovalBrokerState();
    const port = readBrokerPort();
    const token = readBrokerToken();
    if (port === null || !token) return null;
    const baseUrl = getBrokerBaseUrl(port);
    if (!(await pingBroker(baseUrl))) return null;
    return { baseUrl, port, token };
}

export async function openApprovalBrowser(url: string): Promise<void> {
    const commands =
        process.platform === 'win32'
            ? [
                  {
                      cmd: 'powershell.exe',
                      args: ['-NoProfile', '-Command', `Start-Process ${JSON.stringify(url)}`]
                  },
                  {
                      cmd: 'cmd',
                      args: ['/c', 'start', '""', url]
                  }
              ]
            : process.platform === 'darwin'
              ? [{ cmd: 'open', args: [url] }]
              : [{ cmd: 'xdg-open', args: [url] }];

    for (const command of commands) {
        try {
            const child = spawn(command.cmd, command.args, {
                detached: true,
                stdio: 'ignore',
                ...(process.platform === 'win32'
                    ? { windowsHide: true }
                    : {})
            });
            child.unref();
            return;
        } catch {
            // try next launcher
        }
    }
}

export function removeApprovalStateDir(): void {
    if (!existsSync(getApprovalStateDir())) return;
    rmSync(getApprovalStateDir(), { recursive: true, force: true });
}

export function writeBrokerState(pid: number, port: number, token: string): void {
    ensureApprovalStateDirs();
    writeFileSync(getApprovalBrokerPidFile(), String(pid), 'utf-8');
    writeFileSync(getApprovalBrokerPortFile(), String(port), 'utf-8');
    writeFileSync(getApprovalBrokerTokenFile(), token, 'utf-8');
    bestEffortChmod0600(getApprovalBrokerPidFile());
    bestEffortChmod0600(getApprovalBrokerPortFile());
    bestEffortChmod0600(getApprovalBrokerTokenFile());
}

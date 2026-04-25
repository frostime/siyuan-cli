import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    unlinkSync,
    writeFileSync
} from 'node:fs';
import { join } from 'pathe';
import { spawn } from 'node:child_process';
import { getConfigDir } from '../utils/paths.js';
import { ApprovalBrokerUnavailableError } from './errors.js';

export const DEFAULT_REQUEST_TIMEOUT_SEC = 60;
export const QUEUE_EMPTY_GRACE_MS = 30_000;
export const HARD_IDLE_TIMEOUT_MS = 5 * 60_000;
export const BROKER_READY_TIMEOUT_MS = 5_000;

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

export function ensureApprovalStateDirs(): void {
    mkdirSync(getApprovalRequestsDir(), { recursive: true });
    mkdirSync(getApprovalAuditDir(), { recursive: true });
}

export function readBrokerPid(): number | null {
    const path = getApprovalBrokerPidFile();
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return null;
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
}

export function readBrokerPort(): number | null {
    const path = getApprovalBrokerPortFile();
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return null;
    const port = Number.parseInt(raw, 10);
    return Number.isFinite(port) ? port : null;
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
                SIYUAN_APPROVAL_CLI_ENTRY: cliEntry
            }
        }
    );
    child.unref();
}

export async function waitForApprovalBroker(
    timeoutMs = BROKER_READY_TIMEOUT_MS
): Promise<{ baseUrl: string; port: number }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const port = readBrokerPort();
        if (port !== null) {
            const baseUrl = getBrokerBaseUrl(port);
            if (await pingBroker(baseUrl)) {
                return { baseUrl, port };
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new ApprovalBrokerUnavailableError(
        `Approval broker did not become ready within ${timeoutMs}ms.`
    );
}

export async function openApprovalBrowser(url: string): Promise<void> {
    const command =
        process.platform === 'win32'
            ? {
                  cmd: 'cmd',
                  args: ['/c', 'start', '""', url]
              }
            : process.platform === 'darwin'
              ? { cmd: 'open', args: [url] }
              : { cmd: 'xdg-open', args: [url] };

    try {
        const child = spawn(command.cmd, command.args, {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();
    } catch {
        // best-effort browser launch; manual `siyuan approval open` remains available
    }
}

export function removeApprovalStateDir(): void {
    if (!existsSync(getApprovalStateDir())) return;
    rmSync(getApprovalStateDir(), { recursive: true, force: true });
}

export function writeBrokerState(pid: number, port: number): void {
    ensureApprovalStateDirs();
    writeFileSync(getApprovalBrokerPidFile(), String(pid), 'utf-8');
    writeFileSync(getApprovalBrokerPortFile(), String(port), 'utf-8');
}

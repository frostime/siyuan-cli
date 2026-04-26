/**
 * Broker process lifecycle: spawn, wait, lock, ping, stale cleanup.
 *
 * Path and file I/O primitives live in broker-paths.ts.
 * Browser opening lives in broker-browser.ts.
 */
import {
    closeSync,
    existsSync,
    openSync,
    statSync,
    writeFileSync
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ApprovalBrokerUnavailableError } from './errors.js';
import type { ApprovalResolvedBroker } from './types.js';
import {
    cleanupApprovalBrokerState,
    ensureApprovalStateDirs,
    getApprovalBrokerStartLockFile,
    readBrokerPid,
    readBrokerPort,
    readBrokerToken,
    getBrokerBaseUrl,
    removeIfExists,
    writeBrokerState,
    bestEffortChmod0600
} from './broker-paths.js';

// ── Policy constants ─────────────────────────────────────────────────────────

export const DEFAULT_REQUEST_TIMEOUT_SEC = 60;
export const QUEUE_EMPTY_GRACE_MS = 30_000;
export const HARD_IDLE_TIMEOUT_MS = 5 * 60_000;
export const BROKER_READY_TIMEOUT_MS = 5_000;
export const BROKER_START_LOCK_STALE_MS = 15_000;

// ── Stale cleanup ────────────────────────────────────────────────────────────

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

// ── Ping ─────────────────────────────────────────────────────────────────────

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

// ── Broker spawn ─────────────────────────────────────────────────────────────

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

// ── Startup lock ─────────────────────────────────────────────────────────────

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

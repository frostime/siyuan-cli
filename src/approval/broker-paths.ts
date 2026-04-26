/**
 * Broker filesystem paths and file I/O primitives.
 *
 * Pure utilities — no process management, no network, no state.
 */
import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    unlinkSync,
    writeFileSync
} from 'node:fs';
import { join } from 'pathe';
import { getConfigDir } from '../utils/paths.js';

// ── Directory paths ──────────────────────────────────────────────────────────

export function getApprovalStateDir(): string {
    return join(getConfigDir(), 'runtime', 'approval');
}

export function getApprovalRequestsDir(): string {
    return join(getApprovalStateDir(), 'requests');
}

export function getApprovalAuditDir(): string {
    return join(getApprovalStateDir(), 'audit');
}

// ── Broker state file paths ──────────────────────────────────────────────────

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

// ── Directory bootstrap ──────────────────────────────────────────────────────

export function ensureApprovalStateDirs(): void {
    mkdirSync(getApprovalRequestsDir(), { recursive: true });
    mkdirSync(getApprovalAuditDir(), { recursive: true });
}

// ── File I/O primitives ──────────────────────────────────────────────────────

export function bestEffortChmod0600(path: string): void {
    try {
        chmodSync(path, 0o600);
    } catch {
        // Windows or unsupported FS
    }
}

export function readIntegerFile(path: string): number | null {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
}

export function readTextFile(path: string): string | null {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8').trim();
    return raw || null;
}

export function removeIfExists(path: string): void {
    if (!existsSync(path)) return;
    try {
        unlinkSync(path);
    } catch {
        // best-effort cleanup
    }
}

// ── Broker state read/write ──────────────────────────────────────────────────

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

export function writeBrokerState(pid: number, port: number, token: string): void {
    ensureApprovalStateDirs();
    writeFileSync(getApprovalBrokerPidFile(), String(pid), 'utf-8');
    writeFileSync(getApprovalBrokerPortFile(), String(port), 'utf-8');
    writeFileSync(getApprovalBrokerTokenFile(), token, 'utf-8');
    bestEffortChmod0600(getApprovalBrokerPidFile());
    bestEffortChmod0600(getApprovalBrokerPortFile());
    bestEffortChmod0600(getApprovalBrokerTokenFile());
}

export function cleanupApprovalBrokerState(): void {
    removeIfExists(getApprovalBrokerPidFile());
    removeIfExists(getApprovalBrokerPortFile());
    removeIfExists(getApprovalBrokerTokenFile());
}

export function removeApprovalStateDir(): void {
    if (!existsSync(getApprovalStateDir())) return;
    rmSync(getApprovalStateDir(), { recursive: true, force: true });
}

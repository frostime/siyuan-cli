/**
 * Process-binding state and two-step protocol.
 *
 * A binding attaches a workspace name to an observable OS process instance
 * (the anchor), so later invocations inside the same process scope resolve
 * to that workspace without per-call flags. The anchor is selected as the
 * nearest common ancestor of two independent CLI calls (`bind` and
 * `confirm`) and is identified by the process-tree module's instance
 * matching: PID + start identity when available, otherwise PID + command
 * signature — never bare PID. One OS process may host several logical
 * callers; they share the binding by contract.
 *
 * State lives under the CLI config directory (see getProcessBindingDir),
 * one JSON file per pending probe and per confirmed binding. Files are
 * written atomically (temp + rename) and are self-healing: a record that
 * cannot be parsed or validated is deleted and ignored. Runtime binding
 * state never enters config.yaml.
 *
 * Failure contract: every protocol failure is a structured CliError
 * (expired/missing nonce, same-call confirm, disjoint ancestries,
 * unidentifiable anchor). Matching never silently degrades.
 */
import {
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join } from 'pathe';
import { CliError, ExitCode } from '../shared/errors.js';
import { getProcessBindingDir } from './paths.js';
import {
    captureProcessAncestry,
    createDefaultProcessTreeHost,
    findNearestCommonAncestor,
    matchProcessInstance,
    type AncestorMatch,
    type ProcessNode,
    type ProcessTreeHost
} from './process-tree.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingProbe {
    /** One-time pairing code between the bind and confirm calls. */
    nonce: string;
    workspace: string;
    /** PID of the bind invocation; confirm from this PID is rejected. */
    selfPid: number;
    /** Bind-time ancestry, self-first. The confirm call must share an ancestor with it. */
    chain: ProcessNode[];
    /** Diagnostic working-directory context at bind time; not part of identity. */
    cwd?: string;
    createdAt: string;
}

export interface ProcessBinding {
    workspace: string;
    /** The anchor process instance the selection is attached to. */
    anchor: ProcessNode;
    boundAt: string;
    cwd?: string;
}

export interface ScopeBinding {
    binding: ProcessBinding;
    match: AncestorMatch;
}

export interface UnbindResult {
    /** Confirmed bindings removed for the current process scope. */
    removed: number;
    /** Pending probes cancelled (they are not scope-scoped). */
    pendingRemoved: number;
}

// ─── Constants and low-level state helpers ───────────────────────────────────

const PENDING_TTL_MS = 15 * 60_000;

function pendingDir(): string {
    return join(getProcessBindingDir(), 'pending');
}

function bindingsDir(): string {
    return join(getProcessBindingDir(), 'bindings');
}

function pendingPath(nonce: string): string {
    return join(pendingDir(), `${sanitizeKey(nonce)}.json`);
}

/**
 * Stable, filesystem-safe file key for an anchor. Derived only from the
 * fields instance matching compares (pid + startId / commandSignature), so
 * re-confirming the same instance overwrites its record instead of piling up
 * duplicates.
 */
function anchorKey(anchor: ProcessNode): string {
    const canonical = JSON.stringify({
        pid: anchor.pid,
        startId: anchor.startId ?? null,
        commandSignature: anchor.commandSignature ?? null
    });
    const hash = createHash('sha256').update(canonical).digest('hex');
    return sanitizeKey(`${anchor.pid}-${hash.slice(0, 16)}`);
}

function sanitizeKey(key: string): string {
    return key.replace(/[^A-Za-z0-9._-]/g, '-');
}

function writeJsonAtomic(filePath: string, value: unknown): void {
    mkdirSync(dirname(filePath), { recursive: true });
    const temp = `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    writeFileSync(temp, JSON.stringify(value, null, 2));
    renameSync(temp, filePath);
}

function readJsonFile(filePath: string): unknown {
    try {
        return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
        return undefined;
    }
}

function listStateFiles(dir: string): string[] {
    try {
        return readdirSync(dir).filter((name) => name.endsWith('.json'));
    } catch {
        return [];
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

// ─── Bind step ───────────────────────────────────────────────────────────────

export function createPendingProbe(
    workspace: string,
    host: ProcessTreeHost = createDefaultProcessTreeHost(),
    now: () => number = Date.now
): PendingProbe {
    const chain = captureProcessAncestry(host).chain;
    const probe: PendingProbe = {
        nonce: randomBytes(16).toString('hex'),
        workspace,
        selfPid: host.pid,
        chain,
        cwd: process.cwd(),
        createdAt: new Date(now()).toISOString()
    };
    pruneExpiredProbes(now);
    writeJsonAtomic(pendingPath(probe.nonce), probe);
    return probe;
}

/** Delete pending probes that are expired or no longer parseable. */
function pruneExpiredProbes(now: () => number): void {
    for (const name of listStateFiles(pendingDir())) {
        const filePath = join(pendingDir(), name);
        const value = readJsonFile(filePath);
        if (!isRecord(value)) {
            rmSync(filePath, { force: true });
            continue;
        }
        if (isExpired(value, now())) {
            rmSync(filePath, { force: true });
        }
    }
}

function isExpired(value: Record<string, unknown>, nowMs: number): boolean {
    const createdAt = Date.parse(String(value['createdAt'] ?? ''));
    return Number.isNaN(createdAt) || nowMs - createdAt > PENDING_TTL_MS;
}

/**
 * Read a pending probe without consuming it. Callers that must revalidate
 * external state (e.g. the project file) between bind and confirm read here
 * first, then confirm.
 */
export function getPendingProbe(
    nonce: string,
    now: () => number = Date.now
): PendingProbe {
    const filePath = pendingPath(nonce);
    const value = readJsonFile(filePath);
    if (!isRecord(value)) {
        // Missing, unreadable, or malformed: the nonce cannot be paired.
        rmSync(filePath, { force: true });
        throw new CliError(
            ExitCode.GENERAL,
            'PROCESS_BINDING_PENDING_NOT_FOUND',
            `No pending process probe for nonce "${nonce}".`,
            'Run `siyuan-cli current bind <workspace>` first, then confirm from a new independent call.'
        );
    }
    if (isExpired(value, now())) {
        rmSync(filePath, { force: true });
        throw new CliError(
            ExitCode.GENERAL,
            'PROCESS_BINDING_PENDING_EXPIRED',
            'The pending process probe has expired.',
            'Start the two-step flow again with `siyuan-cli current bind <workspace>`.'
        );
    }
    return value as unknown as PendingProbe;
}

// ─── Confirm step ────────────────────────────────────────────────────────────

export function confirmPendingProbe(
    nonce: string,
    host: ProcessTreeHost = createDefaultProcessTreeHost(),
    now: () => number = Date.now
): ScopeBinding {
    const filePath = pendingPath(nonce);
    const probe = getPendingProbe(nonce, now);

    if (host.pid === probe.selfPid) {
        throw new CliError(
            ExitCode.GENERAL,
            'PROCESS_BINDING_SAME_CALL',
            'confirm must run in a new independent call, not in the same process as bind.',
            'Run `siyuan-cli current confirm <nonce>` as a separate CLI invocation.'
        );
    }

    const confirmChain = captureProcessAncestry(host).chain;
    const match = findNearestCommonAncestor(probe.chain, confirmChain);
    if (!match || sharesOnlyMachineRoot(probe.chain, confirmChain, match)) {
        // The two calls share no usable ancestor: binding here would claim a
        // scope that does not exist (or degenerate to the machine root, which
        // every process on the host "contains"). Keep the pending probe so
        // the caller can retry confirm from a proper sibling invocation.
        throw new CliError(
            ExitCode.GENERAL,
            'PROCESS_BINDING_NO_COMMON_ANCESTOR',
            match
                ? 'The bind and confirm calls share only the machine root process.'
                : 'The bind and confirm calls share no observable common ancestor process.',
            'Run confirm from the same agent or shell scope that ran bind, or use explicit --workspace instead.'
        );
    }
    if (!match.node.startId && !match.node.commandSignature) {
        throw new CliError(
            ExitCode.GENERAL,
            'PROCESS_BINDING_ANCHOR_UNIDENTIFIABLE',
            `The common ancestor process (pid ${match.node.pid}) cannot be identified across calls.`,
            'Re-run the two-step flow; if it fails again, use explicit --workspace.'
        );
    }

    const binding: ProcessBinding = {
        workspace: probe.workspace,
        anchor: match.node,
        boundAt: new Date(now()).toISOString(),
        cwd: probe.cwd
    };
    // A new binding replaces the previous binding of this whole scope:
    // any existing record anchored inside the confirm-time ancestry is
    // removed, so resolution never has to arbitrate between two matches.
    removeBindingsMatching(confirmChain);
    writeJsonAtomic(join(bindingsDir(), `${anchorKey(binding.anchor)}.json`), binding);
    rmSync(filePath, { force: true });
    return { binding, match };
}

/**
 * True when the nearest common ancestor is the terminal node of both chains:
 * the calls have no common ancestor except the machine root (init/System),
 * so any anchor would effectively be machine-global.
 */
function sharesOnlyMachineRoot(
    bindChain: readonly ProcessNode[],
    confirmChain: readonly ProcessNode[],
    match: AncestorMatch
): boolean {
    const bindIndex = bindChain.indexOf(match.node);
    const confirmIndex = confirmChain.findIndex((node) =>
        matchProcessInstance(node, match.node)
    );
    return (
        bindIndex === bindChain.length - 1 &&
        confirmIndex === confirmChain.length - 1
    );
}

function removeBindingsMatching(chain: readonly ProcessNode[]): number {
    let removed = 0;
    for (const name of listStateFiles(bindingsDir())) {
        const filePath = join(bindingsDir(), name);
        const value = readJsonFile(filePath);
        if (!isBindingRecord(value)) {
            rmSync(filePath, { force: true });
            continue;
        }
        if (chain.some((node) => matchProcessInstance(value.anchor, node))) {
            rmSync(filePath, { force: true });
            removed += 1;
        }
    }
    return removed;
}

function isBindingRecord(value: unknown): value is ProcessBinding {
    if (!isRecord(value)) return false;
    const anchor = value['anchor'];
    return (
        typeof value['workspace'] === 'string' &&
        isRecord(anchor) &&
        typeof anchor['pid'] === 'number' &&
        typeof anchor['ppid'] === 'number'
    );
}

// ─── Unbind ──────────────────────────────────────────────────────────────────

export function unbindProcessScope(
    host: ProcessTreeHost = createDefaultProcessTreeHost()
): UnbindResult {
    const chain = captureProcessAncestry(host).chain;
    const removed = removeBindingsMatching(chain);
    let pendingRemoved = 0;
    for (const name of listStateFiles(pendingDir())) {
        rmSync(join(pendingDir(), name), { force: true });
        pendingRemoved += 1;
    }
    return { removed, pendingRemoved };
}

// ─── Resolution side ─────────────────────────────────────────────────────────

/**
 * Find the confirmed binding that applies to the current process scope, if
 * any. When several records match (only possible through manual state
 * edits), the anchor nearest to the current process wins.
 */
export function findActiveBinding(
    host: ProcessTreeHost = createDefaultProcessTreeHost()
): ScopeBinding | undefined {
    const chain = captureProcessAncestry(host).chain;
    const records: ProcessBinding[] = [];
    for (const name of listStateFiles(bindingsDir())) {
        const value = readJsonFile(join(bindingsDir(), name));
        if (isBindingRecord(value)) records.push(value);
        else rmSync(join(bindingsDir(), name), { force: true });
    }
    if (records.length === 0) return undefined;

    for (const node of chain) {
        for (const binding of records) {
            const match = matchProcessInstance(binding.anchor, node);
            if (match) return { binding, match };
        }
    }
    return undefined;
}

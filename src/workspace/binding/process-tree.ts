import { createHash } from 'node:crypto';

export const MAX_PROCESS_CHAIN_DEPTH = 64;

/** How confidently two same-PID observations identify one process instance. */
export type ProcessIdentityStrength = 'pid+start' | 'pid+signature';

/** A process identity safe to persist: raw command lines never cross this boundary. */
export interface ProcessNode {
    pid: number;
    /** An ancestry relation only; it is not part of process identity. */
    ppid: number;
    name?: string;
    executablePath?: string;
    /** Platform-native process start identity, normalized by its adapter. */
    startId?: string;
    /** SHA-256 of the platform-normalized command line. */
    commandSignature?: string;
    /** Best-effort redacted text for diagnostics. */
    commandSummary?: string;
}

export type AncestryTermination =
    | { kind: 'root' }
    | { kind: 'parent-missing'; parentPid: number }
    | { kind: 'cycle'; pid: number }
    | { kind: 'depth-limit'; maxDepth: number }
    | {
          kind: 'inconsistent';
          stage: 'native' | 'msys-table' | 'msys-handoff';
          reason: string;
      };

export interface ProcessAncestry {
    platform: NodeJS.Platform;
    /** Self first, then ancestors toward the process-tree boundary. */
    chain: ProcessNode[];
    /** Why traversal stopped. This must never be inferred from chain length. */
    termination: AncestryTermination;
}

export interface AncestorMatch {
    node: ProcessNode;
    strength: ProcessIdentityStrength;
}

export type ProcessInstanceState = 'live' | 'stale' | 'unknown';

export interface ProcessInstanceInspection {
    anchor: ProcessNode;
    state: ProcessInstanceState;
    reason:
        | 'identity-match'
        | 'pid-not-found'
        | 'start-id-changed'
        | 'identity-incomplete';
    observed?: ProcessNode;
    match?: AncestorMatch;
}

export function matchProcessInstance(
    a: ProcessNode,
    b: ProcessNode
): AncestorMatch | undefined {
    if (a.pid !== b.pid) return undefined;
    if (a.startId !== undefined && b.startId !== undefined) {
        return a.startId === b.startId
            ? { node: a, strength: 'pid+start' }
            : undefined;
    }
    if (
        a.commandSignature !== undefined &&
        b.commandSignature !== undefined &&
        a.commandSignature === b.commandSignature
    ) {
        return { node: a, strength: 'pid+signature' };
    }
    return undefined;
}

/** Select the shared process nearest to the first observation's caller. */
export function findNearestCommonAncestor(
    chainA: readonly ProcessNode[],
    chainB: readonly ProcessNode[]
): AncestorMatch | undefined {
    for (const nodeA of chainA) {
        for (const nodeB of chainB) {
            const match = matchProcessInstance(nodeA, nodeB);
            if (match) return match;
        }
    }
    return undefined;
}

/**
 * Inspect a recorded instance against an authoritative platform snapshot.
 * A signature mismatch is not proof of PID reuse; only a changed start ID is.
 */
export function inspectProcessInstance(
    anchor: ProcessNode,
    observed: ProcessNode | undefined,
    absenceIsConclusive: boolean
): ProcessInstanceInspection {
    if (!observed) {
        return {
            anchor,
            state: absenceIsConclusive ? 'stale' : 'unknown',
            reason: absenceIsConclusive
                ? 'pid-not-found'
                : 'identity-incomplete'
        };
    }

    const match = matchProcessInstance(anchor, observed);
    if (match) {
        return {
            anchor,
            observed,
            match,
            state: 'live',
            reason: 'identity-match'
        };
    }
    if (anchor.startId !== undefined && observed.startId !== undefined) {
        return {
            anchor,
            observed,
            state: 'stale',
            reason: 'start-id-changed'
        };
    }
    return {
        anchor,
        observed,
        state: 'unknown',
        reason: 'identity-incomplete'
    };
}

const SUMMARY_MAX_LENGTH = 200;
const SECRET_FLAG_NAMES = new Set([
    'token',
    'password',
    'passwd',
    'pwd',
    'secret',
    'api-key',
    'apikey',
    'access-token',
    'auth',
    'authorization',
    'credential',
    'credentials'
]);

export function hashCommandText(commandText: string): string {
    return `sha256:${createHash('sha256').update(commandText).digest('hex')}`;
}

/** Redact argv-like text before it can be used in diagnostics. */
export function summarizeArgvTokens(argv: readonly string[]): string {
    const parts: string[] = [];
    let redactNext = false;
    for (const token of argv) {
        if (redactNext) {
            parts.push('<redacted>');
            redactNext = false;
            continue;
        }
        if (token.startsWith('--')) {
            const name = token.slice(2).toLowerCase();
            const equalsIndex = name.indexOf('=');
            if (equalsIndex === -1) {
                parts.push(token);
                if (SECRET_FLAG_NAMES.has(name)) redactNext = true;
            } else if (SECRET_FLAG_NAMES.has(name.slice(0, equalsIndex))) {
                parts.push(`--${name.slice(0, equalsIndex)}=<redacted>`);
            } else {
                parts.push(token);
            }
            continue;
        }
        if (token.startsWith('-')) {
            parts.push(token);
            continue;
        }
        parts.push(redactLikelySecret(token));
    }

    const summary = parts.join(' ');
    return summary.length > SUMMARY_MAX_LENGTH
        ? `${summary.slice(0, SUMMARY_MAX_LENGTH)}…`
        : summary;
}

function redactLikelySecret(token: string): string {
    if (
        token.length >= 32 &&
        /^[A-Za-z0-9+/=_.~-]+$/.test(token) &&
        /[A-Za-z]/.test(token) &&
        /\d/.test(token)
    ) {
        return '<redacted>';
    }
    return token;
}

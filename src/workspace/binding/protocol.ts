import { randomBytes } from 'node:crypto';
import { CliError, ExitCode, toCliError } from '../../shared/errors.js';
import { createProcessObserver, type ProcessObserver } from './observation.js';
import {
    findNearestCommonAncestor,
    matchProcessInstance,
    type AncestorMatch,
    type AncestryTermination,
    type ProcessAncestry,
    type ProcessNode
} from './process-tree.js';
import {
    deleteBindingFile,
    deletePendingFile,
    deletePendingRecord,
    isPendingNonce,
    listBindingFiles,
    listPendingFiles,
    readPendingFile,
    writeBindingFile,
    writePendingFile,
    type PendingProbeRecord,
    type ProcessBindingRecord,
    type StateFile
} from './state.js';

export type PendingProbe = PendingProbeRecord;
export type ProcessBinding = ProcessBindingRecord;

export interface ScopeBinding {
    binding: ProcessBinding;
    match: AncestorMatch;
}

export interface CancelPendingResult {
    cancelled: true;
    nonce: string;
    workspace: string;
}

export interface UnbindResult {
    /** Confirmed bindings removed from the observed current scope. */
    removed: number;
    /** Conclusively stale confirmed records reclaimed during inspection. */
    reclaimed: number;
}

export const PENDING_TTL_MS = 15 * 60_000;

export function createPendingProbe(
    workspace: string,
    observer: ProcessObserver = createProcessObserver(),
    now: () => number = Date.now,
    cwd: string = process.cwd()
): PendingProbe {
    try {
        pruneExpiredProbes(now());
    } catch (error) {
        throw bindingOperationError(error, {
            bindingExists: false,
            pendingRetained: true,
            requestSent: false
        });
    }

    let ancestry: ProcessAncestry;
    try {
        ancestry = observer.captureBindingAncestry();
    } catch (error) {
        throw bindingOperationError(error, {
            bindingExists: false,
            pendingRetained: false,
            requestSent: false
        });
    }
    const self = ancestry.chain[0];
    if (!self) {
        throw new CliError(
            ExitCode.GENERAL,
            'PROCESS_BINDING_OBSERVATION_FAILED',
            'Process observation returned no current process.',
            'Retry `siyuan-cli current bind <workspace>`, or use explicit --workspace.',
            {
                bindingExists: false,
                pendingRetained: false,
                requestSent: false,
                termination: ancestry.termination
            }
        );
    }

    const probe: PendingProbe = {
        nonce: randomBytes(16).toString('hex'),
        workspace,
        selfPid: self.pid,
        chain: ancestry.chain,
        termination: ancestry.termination,
        cwd,
        createdAt: new Date(now()).toISOString()
    };
    try {
        writePendingFile(probe);
    } catch (error) {
        throw bindingOperationError(error, {
            bindingExists: false,
            pendingRetained: false,
            requestSent: false
        });
    }
    return probe;
}

export function getPendingProbe(
    nonce: string,
    now: () => number = Date.now
): PendingProbe {
    assertPublicNonce(nonce);
    let file: StateFile<PendingProbe> | undefined;
    try {
        file = readPendingFile(nonce);
    } catch (error) {
        throw pendingStateError(error, nonce);
    }
    if (!file) {
        throw pendingUnavailableError(
            'PROCESS_BINDING_PENDING_NOT_FOUND',
            `No pending process probe for nonce "${nonce}".`,
            'Start again with `siyuan-cli current bind <workspace>`.'
        );
    }
    if (file.status === 'unreadable') {
        throw pendingStateError(file, nonce);
    }
    if (file.status === 'invalid' || file.record.nonce !== nonce) {
        deletePendingFile(file.fileName);
        throw pendingUnavailableError(
            'PROCESS_BINDING_PENDING_NOT_FOUND',
            `No valid pending process probe for nonce "${nonce}".`,
            'Start again with `siyuan-cli current bind <workspace>`.'
        );
    }
    if (isExpired(file.record, now())) {
        deletePendingFile(file.fileName);
        throw pendingUnavailableError(
            'PROCESS_BINDING_PENDING_EXPIRED',
            'The pending process probe has expired.',
            'Start again with `siyuan-cli current bind <workspace>`.'
        );
    }
    return file.record;
}

export function pendingExpiresAt(probe: PendingProbe): string {
    return new Date(Date.parse(probe.createdAt) + PENDING_TTL_MS).toISOString();
}

export function confirmPendingProbe(
    nonce: string,
    observer: ProcessObserver = createProcessObserver(),
    now: () => number = Date.now
): ScopeBinding {
    const probe = getPendingProbe(nonce, now);
    let confirmation: ProcessAncestry;
    try {
        confirmation = observer.captureBindingAncestry();
    } catch (error) {
        throw retryableConfirmationError(error, nonce);
    }

    if (
        probe.selfPid === confirmation.chain[0]?.pid ||
        (probe.chain[0] !== undefined &&
            confirmation.chain[0] !== undefined &&
            matchProcessInstance(probe.chain[0], confirmation.chain[0]) !==
                undefined)
    ) {
        throw confirmationFailure(
            'PROCESS_BINDING_SAME_CALL',
            'confirm must run in a new independent call, not in the same process as bind.',
            nonce,
            { termination: confirmation.termination }
        );
    }

    const match = findNearestCommonAncestor(probe.chain, confirmation.chain);
    if (
        !match ||
        sharesOnlyMachineRoot(probe.chain, confirmation.chain, match)
    ) {
        const observationsComplete =
            probe.termination?.kind === 'root' &&
            confirmation.termination.kind === 'root';
        throw confirmationFailure(
            observationsComplete
                ? 'PROCESS_BINDING_NO_COMMON_ANCESTOR'
                : 'PROCESS_BINDING_OBSERVATION_INSUFFICIENT',
            observationsComplete
                ? match
                    ? 'The bind and confirm calls share only the machine root process.'
                    : 'The bind and confirm calls share no process scope that can be bound.'
                : 'Process observation ended before a common binding scope could be established.',
            nonce,
            {
                bindTermination: probe.termination ?? null,
                confirmTermination: confirmation.termination
            }
        );
    }

    const binding: ProcessBinding = {
        workspace: probe.workspace,
        anchor: match.node,
        boundAt: new Date(now()).toISOString(),
        ...(probe.cwd ? { cwd: probe.cwd } : {})
    };
    let replaced: ValidBindingFile[];
    let writtenFile: string;
    try {
        const existing = loadValidBindingFiles();
        replaced = existing.filter(({ record }) =>
            confirmation.chain.some((node) =>
                matchProcessInstance(record.anchor, node)
            )
        );
        writtenFile = writeBindingFile(binding);
    } catch (error) {
        throw confirmationWriteError(error, nonce);
    }

    let pendingRetained = true;
    try {
        deletePendingRecord(nonce);
        pendingRetained = false;
        for (const file of replaced) {
            if (file.fileName !== writtenFile) deleteBindingFile(file.fileName);
        }
    } catch (error) {
        throw confirmationCleanupError(error, nonce, pendingRetained);
    }
    return { binding, match };
}

export function cancelPendingProbe(
    nonce: string,
    now: () => number = Date.now
): CancelPendingResult {
    const probe = getPendingProbe(nonce, now);
    deletePendingRecord(nonce);
    return { cancelled: true, nonce, workspace: probe.workspace };
}

export function unbindProcessScope(
    observer: ProcessObserver = createProcessObserver()
): UnbindResult {
    const files = loadValidBindingFiles();
    if (files.length === 0) return { removed: 0, reclaimed: 0 };

    const inspected = inspectBindings(files, observer);
    for (const file of inspected.stale) deleteBindingFile(file.fileName);
    if (inspected.retained.length === 0) {
        return { removed: 0, reclaimed: inspected.stale.length };
    }

    const ancestry = requireCurrentAncestry(inspected, 'unbind');
    const matching = inspected.retained.filter(({ record }) =>
        ancestry.chain.some((node) => matchProcessInstance(record.anchor, node))
    );
    for (const file of matching) deleteBindingFile(file.fileName);
    if (matching.length === 0) {
        assertConclusiveNoMatch(inspected.retained, ancestry, 'unbind');
    }
    return {
        removed: matching.length,
        reclaimed: inspected.stale.length
    };
}

/**
 * Return the nearest confirmed binding in the current process scope. Stale
 * instances are reclaimed, while uncertain records are always retained.
 */
export function findActiveBinding(
    observer: ProcessObserver = createProcessObserver()
): ScopeBinding | undefined {
    const files = loadValidBindingFiles();
    if (files.length === 0) return undefined;

    const inspected = inspectBindings(files, observer);
    for (const file of inspected.stale) deleteBindingFile(file.fileName);
    if (inspected.retained.length === 0) return undefined;

    const ancestry = requireCurrentAncestry(inspected, 'lookup');
    for (const node of ancestry.chain) {
        for (const { record: binding } of inspected.retained) {
            const match = matchProcessInstance(binding.anchor, node);
            if (match) return { binding, match };
        }
    }
    assertConclusiveNoMatch(inspected.retained, ancestry, 'lookup');
    return undefined;
}

/** Add exact retry/cancel state to a command-layer confirm validation error. */
export function withPendingConfirmationRecovery(
    error: unknown,
    nonce: string
): CliError {
    return retryableConfirmationError(error, nonce);
}

type ValidBindingFile = Extract<StateFile<ProcessBinding>, { status: 'valid' }>;

interface InspectedBindings {
    retained: ValidBindingFile[];
    stale: ValidBindingFile[];
    ancestry?: ProcessAncestry;
}

function loadValidBindingFiles(): ValidBindingFile[] {
    let files: StateFile<ProcessBinding>[];
    try {
        files = listBindingFiles();
    } catch (error) {
        throw bindingStateError(error);
    }

    const valid: ValidBindingFile[] = [];
    for (const file of files) {
        if (file.status === 'valid') {
            valid.push(file);
        } else if (file.status === 'invalid') {
            deleteBindingFile(file.fileName);
        } else {
            throw bindingStateError(file);
        }
    }
    return valid;
}

function inspectBindings(
    files: ValidBindingFile[],
    observer: ProcessObserver
): InspectedBindings {
    let observation;
    try {
        observation = observer.inspectAnchorsAndCurrentScope(
            files.map(({ record }) => record.anchor)
        );
    } catch (error) {
        throw activeObservationError(error, files.length);
    }
    if (observation.anchorInspections.length !== files.length) {
        throw activeObservationError(
            new Error(
                'observer returned a different number of anchor inspections'
            ),
            files.length
        );
    }

    const retained: ValidBindingFile[] = [];
    const stale: ValidBindingFile[] = [];
    observation.anchorInspections.forEach((inspection, index) => {
        const file = files[index]!;
        if (inspection.state === 'stale') stale.push(file);
        else retained.push(file);
    });
    return {
        retained,
        stale,
        ...(observation.ancestry ? { ancestry: observation.ancestry } : {})
    };
}

function requireCurrentAncestry(
    inspected: InspectedBindings,
    operation: 'lookup' | 'unbind'
): ProcessAncestry {
    if (inspected.ancestry) return inspected.ancestry;
    throw insufficientObservationError(
        operation,
        inspected.retained.length,
        undefined
    );
}

function assertConclusiveNoMatch(
    retained: ValidBindingFile[],
    ancestry: ProcessAncestry,
    operation: 'lookup' | 'unbind'
): void {
    const unresolvedPid = retained.some(({ record }) =>
        ancestry.chain.some((node) => node.pid === record.anchor.pid)
    );
    if (ancestry.termination.kind !== 'root' || unresolvedPid) {
        throw insufficientObservationError(
            operation,
            retained.length,
            ancestry.termination
        );
    }
}

function sharesOnlyMachineRoot(
    bindChain: readonly ProcessNode[],
    confirmChain: readonly ProcessNode[],
    match: AncestorMatch
): boolean {
    if (match.node.ppid !== 0) return false;
    const bindIndex = bindChain.indexOf(match.node);
    const confirmIndex = confirmChain.findIndex((node) =>
        matchProcessInstance(node, match.node)
    );
    return (
        bindIndex === bindChain.length - 1 &&
        confirmIndex === confirmChain.length - 1
    );
}

function pruneExpiredProbes(nowMs: number): void {
    const files = listPendingFiles();
    for (const file of files) {
        // Pending records are nonce-scoped and do not participate in active
        // selection. An unrelated unreadable nonce must not block a new bind.
        if (file.status === 'unreadable') continue;
        if (file.status === 'invalid' || isExpired(file.record, nowMs)) {
            deletePendingFile(file.fileName);
        }
    }
}

function isExpired(probe: PendingProbe, nowMs: number): boolean {
    return nowMs >= Date.parse(probe.createdAt) + PENDING_TTL_MS;
}

function assertPublicNonce(nonce: string): void {
    if (isPendingNonce(nonce)) return;
    throw pendingUnavailableError(
        'PROCESS_BINDING_NONCE_INVALID',
        'The pending confirmation nonce has an invalid format.',
        'Use the exact 32-character nonce printed by `siyuan-cli current bind <workspace>`.'
    );
}

function pendingStateError(error: unknown, nonce?: string): CliError {
    const cause = toCliError(error);
    const retryCommand = nonce
        ? `siyuan-cli current confirm ${nonce}`
        : undefined;
    const cancelCommand = nonce
        ? `siyuan-cli current cancel ${nonce}`
        : undefined;
    return new CliError(
        ExitCode.GENERAL,
        'PROCESS_BINDING_STATE_UNAVAILABLE',
        'Pending confirmation state exists but could not be read.',
        retryCommand && cancelCommand
            ? `After restoring access, retry: ${retryCommand}. Cancel: ${cancelCommand}.`
            : 'Restore access to the process-binding state and retry.',
        {
            bindingExists: false,
            pendingRetained: true,
            canRetry: true,
            requestSent: false,
            ...(retryCommand ? { retryCommand } : {}),
            ...(cancelCommand ? { cancelCommand } : {}),
            ...stateFailureDetails(error, cause)
        }
    );
}

function bindingStateError(error: unknown): CliError {
    const cause = toCliError(error);
    return new CliError(
        ExitCode.GENERAL,
        'PROCESS_BINDING_STATE_UNAVAILABLE',
        'Confirmed process-binding state exists but could not be read.',
        'Restore access to the process-binding state and retry; no state was removed.',
        {
            bindingExists: 'unknown',
            requestSent: false,
            ...stateFailureDetails(error, cause)
        }
    );
}

function pendingUnavailableError(
    errorType: string,
    message: string,
    hint: string
): CliError {
    return new CliError(ExitCode.GENERAL, errorType, message, hint, {
        bindingExists: false,
        pendingRetained: false,
        canRetry: false,
        requestSent: false
    });
}

function confirmationFailure(
    errorType: string,
    message: string,
    nonce: string,
    extra?: Record<string, unknown>
): CliError {
    const retryCommand = `siyuan-cli current confirm ${nonce}`;
    const cancelCommand = `siyuan-cli current cancel ${nonce}`;
    return new CliError(
        ExitCode.GENERAL,
        errorType,
        `${message} No binding was created; the pending confirmation is retained.`,
        `Retry: ${retryCommand}. Cancel: ${cancelCommand}.`,
        {
            ...extra,
            bindingExists: false,
            pendingRetained: true,
            canRetry: true,
            retryCommand,
            cancelCommand,
            requestSent: false
        }
    );
}

function retryableConfirmationError(error: unknown, nonce: string): CliError {
    const cause = toCliError(error);
    const recovery = confirmationFailure(
        cause.errorType,
        cause.message,
        nonce,
        {
            ...detailsRecord(cause.details),
            ...(cause.hint ? { causeHint: cause.hint } : {})
        }
    );
    return new CliError(
        cause.code,
        recovery.errorType,
        recovery.message,
        [cause.hint, recovery.hint].filter(Boolean).join(' '),
        recovery.details
    );
}

function confirmationWriteError(error: unknown, nonce: string): CliError {
    const cause = toCliError(error);
    return retryableConfirmationError(
        new CliError(
            cause.code,
            'PROCESS_BINDING_PERSISTENCE_FAILED',
            `The confirmed binding could not be written: ${cause.message}`,
            cause.hint,
            {
                ...detailsRecord(cause.details),
                cause: cause.errorType
            }
        ),
        nonce
    );
}

function confirmationCleanupError(
    error: unknown,
    nonce: string,
    pendingRetained: boolean
): CliError {
    const cause = toCliError(error);
    const cancelCommand = `siyuan-cli current cancel ${nonce}`;
    const recovery = [
        cause.hint,
        'Inspect: siyuan-cli current which.',
        'Unbind if needed: siyuan-cli current unbind.',
        pendingRetained
            ? `Cancel the retained pending state: ${cancelCommand}.`
            : undefined
    ]
        .filter(Boolean)
        .join(' ');
    return new CliError(
        cause.code,
        'PROCESS_BINDING_PERSISTENCE_FAILED',
        'The binding was written, but confirmation-state cleanup failed.',
        recovery,
        {
            ...detailsRecord(cause.details),
            bindingExists: true,
            pendingRetained,
            canRetry: false,
            requestSent: false,
            cause: cause.errorType,
            ...(cause.hint ? { causeHint: cause.hint } : {}),
            inspectCommand: 'siyuan-cli current which',
            unbindCommand: 'siyuan-cli current unbind',
            ...(pendingRetained ? { cancelCommand } : {})
        }
    );
}

function activeObservationError(
    error: unknown,
    bindingCount: number
): CliError {
    const cause = toCliError(error);
    return new CliError(
        cause.code,
        'PROCESS_BINDING_OBSERVATION_FAILED',
        `Existing process bindings could not be inspected: ${cause.message}`,
        'Retry with explicit `--workspace <name>` to avoid an uncertain implicit selection.',
        {
            ...detailsRecord(cause.details),
            bindingExists: true,
            bindingCount,
            requestSent: false,
            cause: cause.errorType
        }
    );
}

function insufficientObservationError(
    operation: 'lookup' | 'unbind',
    bindingCount: number,
    termination: AncestryTermination | undefined
): CliError {
    return new CliError(
        ExitCode.GENERAL,
        'PROCESS_BINDING_OBSERVATION_INSUFFICIENT',
        operation === 'lookup'
            ? 'Existing process bindings remain, but current process ancestry is incomplete.'
            : 'Existing process bindings remain, but the current unbind scope cannot be determined.',
        operation === 'lookup'
            ? 'Retry with explicit `--workspace <name>`; no SiYuan request was sent.'
            : 'Retry `siyuan-cli current unbind`, or leave the retained binding unchanged.',
        {
            bindingExists: true,
            bindingCount,
            requestSent: false,
            termination: termination ?? null
        }
    );
}

function bindingOperationError(
    error: unknown,
    details: Record<string, unknown>
): CliError {
    const cause = toCliError(error);
    return new CliError(
        cause.code,
        cause.errorType,
        cause.message,
        cause.hint,
        { ...detailsRecord(cause.details), ...details }
    );
}

function stateFailureDetails(
    error: unknown,
    cause: CliError
): Record<string, unknown> {
    const errorCode =
        typeof error === 'object' && error !== null
            ? ((error as { errorCode?: string; code?: string }).errorCode ??
              (error as { code?: string }).code)
            : undefined;
    return {
        cause: cause.errorType,
        ...(errorCode ? { errorCode } : {})
    };
}

function detailsRecord(details: unknown): Record<string, unknown> {
    return typeof details === 'object' &&
        details !== null &&
        !Array.isArray(details)
        ? (details as Record<string, unknown>)
        : {};
}

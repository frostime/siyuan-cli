/**
 * Compatibility facade for callers that still inject the former host type.
 * New command and lifecycle code should import binding/protocol.ts directly.
 */
export type {
    CancelPendingResult,
    PendingProbe,
    ProcessBinding,
    ScopeBinding,
    UnbindResult
} from './binding/protocol.js';
export {
    PENDING_TTL_MS,
    cancelPendingProbe,
    getPendingProbe,
    pendingExpiresAt,
    withPendingConfirmationRecovery
} from './binding/protocol.js';

import {
    confirmPendingProbe as confirmWithObserver,
    createPendingProbe as createWithObserver,
    unbindProcessScope as unbindWithObserver,
    type PendingProbe,
    type ProcessBinding,
    type ScopeBinding,
    type UnbindResult
} from './binding/protocol.js';
import {
    captureProcessAncestry,
    createDefaultProcessTreeHost,
    createProcessObserver,
    matchProcessInstance,
    type ProcessTreeHost
} from './process-tree.js';
import { CliError, ExitCode } from '../shared/errors.js';
import { deleteBindingFile, listBindingFiles } from './binding/state.js';

export function createPendingProbe(
    workspace: string,
    host: ProcessTreeHost = createDefaultProcessTreeHost(),
    now: () => number = Date.now
): PendingProbe {
    return createWithObserver(workspace, createProcessObserver(host), now);
}

export function confirmPendingProbe(
    nonce: string,
    host: ProcessTreeHost = createDefaultProcessTreeHost(),
    now: () => number = Date.now
): ScopeBinding {
    return confirmWithObserver(nonce, createProcessObserver(host), now);
}

export function unbindProcessScope(
    host: ProcessTreeHost = createDefaultProcessTreeHost()
): UnbindResult {
    return unbindWithObserver(createProcessObserver(host));
}

export function findActiveBinding(
    host: ProcessTreeHost = createDefaultProcessTreeHost()
): ScopeBinding | undefined {
    // N6 will move workspace resolution to protocol.findActiveBinding(). Until
    // then this facade preserves the resolver's prior capture-and-match behavior.
    const chain = captureProcessAncestry(host).chain;
    const bindings: ProcessBinding[] = [];
    for (const file of listBindingFiles()) {
        if (file.status === 'valid') {
            bindings.push(file.record);
        } else if (file.status === 'invalid') {
            deleteBindingFile(file.fileName);
        } else {
            throw new CliError(
                ExitCode.GENERAL,
                'PROCESS_BINDING_STATE_UNAVAILABLE',
                'Confirmed process-binding state exists but could not be read.',
                'Restore access to the process-binding state and retry; no state was removed.',
                {
                    bindingExists: 'unknown',
                    requestSent: false,
                    ...(file.errorCode ? { errorCode: file.errorCode } : {})
                }
            );
        }
    }
    for (const node of chain) {
        for (const binding of bindings) {
            const match = matchProcessInstance(binding.anchor, node);
            if (match) return { binding, match };
        }
    }
    return undefined;
}

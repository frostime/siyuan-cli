/**
 * Compatibility facade for callers that still use the pre-binding-subsystem API.
 * New lifecycle code should depend on binding/observation.ts directly.
 */
export * from './binding/process-tree.js';
export type {
    CommandResult,
    ObservationHost,
    ProcessObserver,
    ProcessScopeObservation
} from './binding/observation.js';

import {
    createDefaultObservationHost,
    createProcessObserver,
    type ObservationHost
} from './binding/observation.js';
import type { ProcessAncestry } from './binding/process-tree.js';

export type ProcessTreeHost = ObservationHost;
export const createDefaultProcessTreeHost = createDefaultObservationHost;
export { createDefaultObservationHost, createProcessObserver };

export function captureProcessAncestry(
    host: ProcessTreeHost = createDefaultProcessTreeHost()
): ProcessAncestry {
    return createProcessObserver(host).captureBindingAncestry();
}

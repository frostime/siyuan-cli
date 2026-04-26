/**
 * Approval module public API.
 *
 * Re-exports the business logic surface used by guard.ts.
 * CLI command implementations live in command.ts and are not re-exported here.
 */
export { startApprovalBroker } from './broker.js';
export { openApprovalBrowser } from './broker-browser.js';
export {
    buildPreparedApprovalRequest,
    ensureBroker,
    requestAndWait
} from './client.js';
export {
    ApprovalBrokerUnavailableError,
    ApprovalCancelledError,
    ApprovalRejectedError,
    ApprovalTimeoutError
} from './errors.js';
export {
    BROKER_READY_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_SEC,
    HARD_IDLE_TIMEOUT_MS,
    QUEUE_EMPTY_GRACE_MS
} from './runtime.js';
export type {
    ApprovalActor,
    ApprovalBrokerStatus,
    ApprovalClientOptions,
    ApprovalCreateResponse,
    ApprovalDecision,
    ApprovalPendingEvent,
    ApprovalRequest,
    ApprovalStatus,
    PreparedApprovalRequest,
    RequestApprovalInput
} from './types.js';

import { CliError, ExitCode } from '../shared/errors.js';

export class ApprovalRejectedError extends CliError {
    constructor(requestId: string, url: string, note?: string) {
        super(
            ExitCode.GENERAL,
            'APPROVAL_REJECTED',
            `Approval request "${requestId}" was rejected.`,
            undefined,
            {
                requestId,
                url,
                ...(note ? { note } : {})
            }
        );
    }
}

export class ApprovalTimeoutError extends CliError {
    constructor(requestId: string, timeoutSec: number, url: string) {
        super(
            ExitCode.GENERAL,
            'APPROVAL_TIMEOUT',
            `Approval request "${requestId}" timed out after ${timeoutSec}s.`,
            undefined,
            { requestId, url }
        );
    }
}

export class ApprovalCancelledError extends CliError {
    constructor(requestId: string, url: string) {
        super(
            ExitCode.GENERAL,
            'APPROVAL_CANCELLED',
            `Approval request "${requestId}" was cancelled.`,
            undefined,
            { requestId, url }
        );
    }
}

export class ApprovalBrokerUnavailableError extends CliError {
    constructor(message: string, details?: unknown) {
        super(
            ExitCode.GENERAL,
            'APPROVAL_BROKER_UNAVAILABLE',
            message,
            'Run `siyuan approval status` to inspect the local approval broker.',
            details
        );
    }
}

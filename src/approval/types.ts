import type { RegisteredEndpoint, SeverityLabel } from '../shared/schema.js';
import type { JsonPrintExtra } from '../shared/output.js';

export type ApprovalStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'timed_out'
    | 'cancelled';

export type ApprovalActor = 'human-browser' | 'human-cli' | 'caller';

export interface PreparedApprovalRequest {
    workspaceName: string;
    endpointId: string;
    endpointPath: string;
    callerTool?: string;
    severity: SeverityLabel;
    summary: string;
    payloadPreview: unknown;
    payloadDigest: string;
    resourceSummary: string[];
    timeoutSec: number;
    triggerReason?: string;
}

export interface ApprovalDecision {
    status: Exclude<ApprovalStatus, 'pending'>;
    decidedAt: string;
    actor: ApprovalActor;
    note?: string;
}

export interface ApprovalRequest extends PreparedApprovalRequest {
    id: string;
    status: ApprovalStatus;
    createdAt: string;
    expiresAt: string;
    decision?: ApprovalDecision;
}

export interface ApprovalPendingEvent {
    event: 'APPROVAL_PENDING';
    requestId: string;
    url: string;
    summary: string;
    expiresAt: string;
}

export interface ApprovalCreateResponse {
    requestId: string;
    status: ApprovalStatus;
    url: string;
    expiresAt: string;
}

export interface ApprovalBrokerStatus {
    running: boolean;
    pid: number | null;
    port: number | null;
    pendingCount: number;
    waiterCount: number;
}

export interface ApprovalResolvedBroker {
    baseUrl: string;
    port: number;
    token: string;
}

export interface ApprovalClientOptions {
    cwd?: string;
    autoOpen?: boolean;
    openDebounceMs?: number;
    openBrowser?: (url: string) => void | Promise<void>;
    jsonExtra?: JsonPrintExtra;
}

export interface RequestApprovalInput {
    workspaceName: string;
    entry: RegisteredEndpoint;
    payload: unknown;
    callerTool?: string;
    timeoutSec?: number;
    triggerReason?: string;
}

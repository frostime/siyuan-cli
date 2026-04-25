import { createHash } from 'node:crypto';
import { deriveEndpointId, evaluatePointerPath, type RegisteredEndpoint } from '../core/schema.js';
import {
    ApprovalBrokerUnavailableError,
    ApprovalCancelledError,
    ApprovalRejectedError,
    ApprovalTimeoutError
} from './errors.js';
import {
    DEFAULT_REQUEST_TIMEOUT_SEC,
    cleanupStaleApprovalBrokerState,
    getBrokerBaseUrl,
    openApprovalBrowser,
    pingBroker,
    readBrokerPort,
    spawnApprovalBroker,
    waitForApprovalBroker
} from './runtime.js';
import type {
    ApprovalClientOptions,
    ApprovalCreateResponse,
    ApprovalDecision,
    ApprovalPendingEvent,
    PreparedApprovalRequest,
    RequestApprovalInput
} from './types.js';

function writePendingEvent(event: ApprovalPendingEvent): void {
    process.stderr.write(JSON.stringify(event) + '\n');
}

async function readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

export async function ensureBroker(
    _opts?: ApprovalClientOptions
): Promise<{ baseUrl: string }> {
    cleanupStaleApprovalBrokerState();
    const port = readBrokerPort();
    if (port !== null) {
        const baseUrl = getBrokerBaseUrl(port);
        if (await pingBroker(baseUrl)) return { baseUrl };
    }

    await spawnApprovalBroker();
    const ready = await waitForApprovalBroker();
    return { baseUrl: ready.baseUrl };
}

export async function createApproval(
    request: PreparedApprovalRequest,
    opts?: ApprovalClientOptions
): Promise<ApprovalCreateResponse> {
    const { baseUrl } = await ensureBroker(opts);
    const response = await fetch(`${baseUrl}/api/approval/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, autoOpen: opts?.autoOpen ?? true })
    });
    if (!response.ok) {
        throw new ApprovalBrokerUnavailableError(
            `Approval broker rejected request creation with HTTP ${response.status}.`
        );
    }
    return readJson<ApprovalCreateResponse>(response);
}

export async function waitForDecision(
    baseUrl: string,
    requestId: string,
    timeoutMs: number
): Promise<ApprovalDecision> {
    const response = await fetch(
        `${baseUrl}/api/approval/requests/${requestId}/wait?timeoutMs=${timeoutMs}`,
        {
            signal: AbortSignal.timeout(timeoutMs + 1_000)
        }
    );
    if (!response.ok) {
        throw new ApprovalBrokerUnavailableError(
            `Approval broker wait failed with HTTP ${response.status}.`,
            { requestId }
        );
    }
    return readJson<ApprovalDecision>(response);
}

export async function requestAndWait(
    request: PreparedApprovalRequest,
    opts?: ApprovalClientOptions
): Promise<ApprovalDecision> {
    const { baseUrl } = await ensureBroker(opts);
    const created = await createApproval(request, opts);
    writePendingEvent({
        event: 'APPROVAL_PENDING',
        requestId: created.requestId,
        url: created.url,
        summary: request.summary,
        expiresAt: created.expiresAt
    });
    const decision = await waitForDecision(
        baseUrl,
        created.requestId,
        request.timeoutSec * 1_000 + 1_000
    );
    if (decision.status === 'approved') return decision;
    if (decision.status === 'rejected') {
        throw new ApprovalRejectedError(created.requestId, created.url);
    }
    if (decision.status === 'timed_out') {
        throw new ApprovalTimeoutError(
            created.requestId,
            request.timeoutSec,
            created.url
        );
    }
    throw new ApprovalCancelledError(created.requestId, created.url);
}

function collectResourceSummary(entry: RegisteredEndpoint, payload: unknown): string[] {
    const targets = entry.schema.guard?.payloadTargets ?? [];
    const summary: string[] = [];
    for (const target of targets) {
        const values = evaluatePointerPath(payload, target.path);
        for (const value of values) {
            if (typeof value === 'string') {
                summary.push(`${target.kind}: ${value}`);
            }
        }
    }
    return summary;
}

function hashPayload(payload: unknown): string {
    return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

export function buildPreparedApprovalRequest(
    input: RequestApprovalInput
): PreparedApprovalRequest {
    const { id } = deriveEndpointId(input.entry.schema.endpoint);
    return {
        workspaceName: input.workspaceName,
        endpointId: id,
        endpointPath: input.entry.schema.endpoint,
        ...(input.callerTool ? { callerTool: input.callerTool } : {}),
        risk:
            input.entry.meta.risk === 'elevated' ||
            input.entry.meta.risk === 'destructive' ||
            input.entry.meta.risk === 'critical'
                ? input.entry.meta.risk
                : 'confirm',
        summary: `Approve write: ${id}`,
        payloadPreview: input.payload,
        payloadDigest: hashPayload(input.payload),
        resourceSummary: collectResourceSummary(input.entry, input.payload),
        timeoutSec: input.timeoutSec ?? DEFAULT_REQUEST_TIMEOUT_SEC
    };
}

export async function getBrokerStatus(): Promise<unknown> {
    const port = readBrokerPort();
    if (port === null) {
        return { running: false, pid: null, port: null, pendingCount: 0, waiterCount: 0 };
    }
    const baseUrl = getBrokerBaseUrl(port);
    if (!(await pingBroker(baseUrl))) {
        return { running: false, pid: null, port: null, pendingCount: 0, waiterCount: 0 };
    }
    const response = await fetch(`${baseUrl}/api/approval/status`);
    return readJson(response);
}

export async function listApprovals(): Promise<unknown> {
    const { baseUrl } = await ensureBroker({ autoOpen: false });
    const response = await fetch(`${baseUrl}/api/approval/requests`);
    return readJson(response);
}

export async function getApproval(requestId: string): Promise<unknown> {
    const { baseUrl } = await ensureBroker({ autoOpen: false });
    const response = await fetch(`${baseUrl}/api/approval/requests/${requestId}`);
    return readJson(response);
}

async function postDecision(requestId: string, action: 'approve' | 'reject'): Promise<unknown> {
    const { baseUrl } = await ensureBroker({ autoOpen: false });
    const response = await fetch(`${baseUrl}/api/approval/requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor: 'human-cli' })
    });
    return readJson(response);
}

export async function approveApproval(requestId: string): Promise<unknown> {
    return postDecision(requestId, 'approve');
}

export async function rejectApproval(requestId: string): Promise<unknown> {
    return postDecision(requestId, 'reject');
}

export async function openApprovalCenter(): Promise<{ url: string }> {
    const { baseUrl } = await ensureBroker({ autoOpen: false });
    const url = `${baseUrl}/approval`;
    await openApprovalBrowser(url);
    return { url };
}

export async function stopApprovalBroker(): Promise<{ ok: boolean }> {
    const port = readBrokerPort();
    if (port === null) return { ok: true };
    const baseUrl = getBrokerBaseUrl(port);
    if (!(await pingBroker(baseUrl))) return { ok: true };
    await fetch(`${baseUrl}/api/approval/shutdown`, { method: 'POST' });
    return { ok: true };
}

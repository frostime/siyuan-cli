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
    acquireBrokerStartLock,
    getRunningBroker,
    openApprovalBrowser,
    readBrokerPort,
    spawnApprovalBroker,
    waitForApprovalBroker
} from './runtime.js';
import type {
    ApprovalClientOptions,
    ApprovalCreateResponse,
    ApprovalDecision,
    ApprovalPendingEvent,
    ApprovalResolvedBroker,
    PreparedApprovalRequest,
    RequestApprovalInput
} from './types.js';

function writePendingEvent(event: ApprovalPendingEvent): void {
    process.stderr.write(JSON.stringify(event) + '\n');
}

async function readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
    const body = await readJson<unknown>(response);
    if (!response.ok) {
        throw new ApprovalBrokerUnavailableError(
            `Approval broker returned HTTP ${response.status}.`,
            body
        );
    }
    return body as T;
}

async function createApprovalWithResolvedBroker(
    broker: ApprovalResolvedBroker,
    request: PreparedApprovalRequest,
    opts?: ApprovalClientOptions
): Promise<ApprovalCreateResponse> {
    const response = await fetch(`${broker.baseUrl}/api/approval/requests`, {
        method: 'POST',
        headers: authHeaders(broker.token),
        body: JSON.stringify({ ...request, autoOpen: opts?.autoOpen ?? true })
    });
    return readJsonOrThrow<ApprovalCreateResponse>(response);
}

async function waitForDecisionWithResolvedBroker(
    broker: ApprovalResolvedBroker,
    requestId: string,
    timeoutMs: number
): Promise<ApprovalDecision> {
    const response = await fetch(
        `${broker.baseUrl}/api/approval/requests/${requestId}/wait?timeoutMs=${timeoutMs}`,
        {
            signal: AbortSignal.timeout(timeoutMs + 1_000)
        }
    );
    return readJsonOrThrow<ApprovalDecision>(response);
}

function authHeaders(token: string): Record<string, string> {
    return {
        'content-type': 'application/json',
        'x-siyuan-approval-token': token
    };
}

export async function ensureBroker(
    _opts?: ApprovalClientOptions
): Promise<ApprovalResolvedBroker> {
    const running = await getRunningBroker();
    if (running) return running;

    const releaseLock = await acquireBrokerStartLock();
    try {
        const afterLock = await getRunningBroker();
        if (afterLock) return afterLock;
        await spawnApprovalBroker();
        return await waitForApprovalBroker();
    } finally {
        releaseLock();
    }
}

export async function createApproval(
    broker: ApprovalResolvedBroker,
    request: PreparedApprovalRequest,
    opts?: ApprovalClientOptions
): Promise<ApprovalCreateResponse> {
    return createApprovalWithResolvedBroker(broker, request, opts);
}

export async function waitForDecision(
    broker: ApprovalResolvedBroker,
    requestId: string,
    timeoutMs: number
): Promise<ApprovalDecision> {
    return waitForDecisionWithResolvedBroker(broker, requestId, timeoutMs);
}

export async function requestAndWait(
    request: PreparedApprovalRequest,
    opts?: ApprovalClientOptions
): Promise<ApprovalDecision> {
    const broker = await ensureBroker(opts);
    const shouldAutoOpen = opts?.autoOpen ?? true;
    const created = await createApprovalWithResolvedBroker(broker, request, {
        ...opts,
        autoOpen: false
    });
    if (shouldAutoOpen) {
        if (opts?.openBrowser) {
            await opts.openBrowser(created.url);
        } else {
            await openApprovalBrowser(created.url);
        }
    }
    writePendingEvent({
        event: 'APPROVAL_PENDING',
        requestId: created.requestId,
        url: created.url,
        summary: request.summary,
        expiresAt: created.expiresAt
    });
    const decision = await waitForDecisionWithResolvedBroker(
        broker,
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
    const broker = await getRunningBroker();
    if (!broker) {
        return {
            running: false,
            pid: null,
            port: null,
            pendingCount: 0,
            waiterCount: 0
        };
    }
    const response = await fetch(`${broker.baseUrl}/api/approval/status`);
    return readJsonOrThrow(response);
}

export async function listApprovals(): Promise<unknown> {
    const broker = await getRunningBroker();
    if (!broker) {
        return { pending: [], recent: [] };
    }
    const response = await fetch(`${broker.baseUrl}/api/approval/requests`);
    return readJsonOrThrow(response);
}

export async function getApproval(requestId: string): Promise<unknown> {
    const broker = await getRunningBroker();
    if (!broker) {
        throw new ApprovalBrokerUnavailableError(
            'Approval broker is not running.',
            { requestId }
        );
    }
    const response = await fetch(`${broker.baseUrl}/api/approval/requests/${requestId}`);
    return readJsonOrThrow(response);
}

async function postDecision(
    requestId: string,
    action: 'approve' | 'reject'
): Promise<unknown> {
    const broker = await getRunningBroker();
    if (!broker) {
        throw new ApprovalBrokerUnavailableError(
            'Approval broker is not running.',
            { requestId, action }
        );
    }
    const response = await fetch(
        `${broker.baseUrl}/api/approval/requests/${requestId}/${action}`,
        {
            method: 'POST',
            headers: authHeaders(broker.token),
            body: JSON.stringify({ actor: 'human-cli' })
        }
    );
    return readJsonOrThrow(response);
}

export async function approveApproval(requestId: string): Promise<unknown> {
    return postDecision(requestId, 'approve');
}

export async function rejectApproval(requestId: string): Promise<unknown> {
    return postDecision(requestId, 'reject');
}

export async function openApprovalCenter(): Promise<{ url: string }> {
    const broker = await ensureBroker({ autoOpen: false });
    const url = `${broker.baseUrl}/approval?token=${encodeURIComponent(broker.token)}`;
    await openApprovalBrowser(url);
    return { url };
}

export async function stopApprovalBroker(): Promise<{ ok: boolean }> {
    const broker = await getRunningBroker();
    if (!broker) return { ok: true };
    const response = await fetch(`${broker.baseUrl}/api/approval/shutdown`, {
        method: 'POST',
        headers: authHeaders(broker.token),
        body: JSON.stringify({ actor: 'caller' })
    });
    await readJsonOrThrow(response);
    return { ok: true };
}

export function currentBrokerPort(): number | null {
    return readBrokerPort();
}

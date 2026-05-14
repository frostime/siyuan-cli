/**
 * Approval business logic: broker connection, request lifecycle, request building.
 *
 * CLI command implementations live in command.ts.
 */
import { createHash } from 'node:crypto';
import { deriveEndpointId, evaluatePointerPath, type RegisteredEndpoint } from '../shared/schema.js';
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
    spawnApprovalBroker,
    waitForApprovalBroker
} from './runtime.js';
import { openApprovalBrowser } from './broker-browser.js';
import { readLastBrowserOpenAt, writeLastBrowserOpenAt } from './broker-paths.js';
import type {
    ApprovalClientOptions,
    ApprovalCreateResponse,
    ApprovalDecision,
    ApprovalPendingEvent,
    ApprovalResolvedBroker,
    PreparedApprovalRequest,
    RequestApprovalInput
} from './types.js';

const DEFAULT_OPEN_DEBOUNCE_MS = 1000;

// ── Stdout/stderr helpers ────────────────────────────────────────────────────

function writePendingEvent(event: ApprovalPendingEvent, opts?: ApprovalClientOptions): void {
    opts?.jsonExtra?.approvals.push(event);
    process.stderr.write(JSON.stringify(event) + '\n');
}

function writeAutoOpenWarning(url: string, opts?: ApprovalClientOptions, details?: unknown): void {
    const warning = {
        warning: 'APPROVAL_AUTO_OPEN_FAILED',
        url,
        hint: 'Open the approval URL manually in a browser.',
        ...(details !== undefined ? { details } : {})
    };
    opts?.jsonExtra?.warnings.push(warning);
    process.stderr.write(JSON.stringify(warning) + '\n');
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

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

function authHeaders(token: string): Record<string, string> {
    return {
        'content-type': 'application/json',
        'x-siyuan-approval-token': token
    };
}

// ── Broker connection ────────────────────────────────────────────────────────

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

// ── Approval request lifecycle ───────────────────────────────────────────────

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
    if (response.status === 504) {
        const body = await response.json().catch(() => ({}));
        const error = body as { error?: string };
        if (error?.error === 'APPROVAL_WAIT_TIMEOUT') {
            // Return a timed_out decision so the caller can throw ApprovalTimeoutError
            return {
                status: 'timed_out',
                decidedAt: new Date().toISOString(),
                actor: 'caller'
            };
        }
    }
    return readJsonOrThrow<ApprovalDecision>(response);
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
        const debounceMs = opts?.openDebounceMs ?? DEFAULT_OPEN_DEBOUNCE_MS;
        const now = Date.now();
        const lastBrowserOpenAt = readLastBrowserOpenAt() ?? 0;
        const shouldOpen = debounceMs <= 0 || now - lastBrowserOpenAt >= debounceMs;
        if (shouldOpen) {
            try {
                const opened = opts?.openBrowser
                    ? (await opts.openBrowser(created.url), true)
                    : await openApprovalBrowser(created.url);
                if (opened) {
                    writeLastBrowserOpenAt(now);
                } else {
                    writeAutoOpenWarning(created.url, opts);
                }
            } catch (error) {
                writeAutoOpenWarning(
                    created.url,
                    opts,
                    error instanceof Error
                        ? { message: error.message }
                        : { error: String(error) }
                );
            }
        }
    }
    writePendingEvent({
        event: 'APPROVAL_PENDING',
        requestId: created.requestId,
        url: created.url,
        summary: request.summary,
        expiresAt: created.expiresAt
    }, opts);
    const decision = await waitForDecisionWithResolvedBroker(
        broker,
        created.requestId,
        request.timeoutSec * 1_000 + 1_000
    );
    if (decision.status === 'approved') return decision;
    if (decision.status === 'rejected') {
        throw new ApprovalRejectedError(
            created.requestId,
            created.url,
            decision.note
        );
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

// ── Request building ─────────────────────────────────────────────────────────

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
        severity: input.entry.meta.severity,
        summary: `Approve endpoint: ${id}`,
        payloadPreview: input.payload,
        payloadDigest: hashPayload(input.payload),
        resourceSummary: collectResourceSummary(input.entry, input.payload),
        timeoutSec: input.timeoutSec ?? DEFAULT_REQUEST_TIMEOUT_SEC,
        triggerReason: input.triggerReason
    };
}

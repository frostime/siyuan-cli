import {
    existsSync,
    readFileSync,
    readdirSync,
    writeFileSync
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'pathe';
import {
    ensureApprovalStateDirs,
    getApprovalAuditDir,
    getApprovalRequestsDir
} from './runtime.js';
import type {
    ApprovalActor,
    ApprovalDecision,
    ApprovalRequest,
    ApprovalStatus,
    PreparedApprovalRequest
} from './types.js';

function getRequestPath(id: string): string {
    return join(getApprovalRequestsDir(), `${id}.json`);
}

function getAuditPath(date: string): string {
    return join(getApprovalAuditDir(), `${date}.jsonl`);
}

function writeRequest(request: ApprovalRequest): void {
    ensureApprovalStateDirs();
    writeFileSync(getRequestPath(request.id), JSON.stringify(request, null, 2), 'utf-8');
}

function readJsonFile<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function createApprovalRequest(
    prepared: PreparedApprovalRequest,
    now = new Date()
): ApprovalRequest {
    const createdAt = now.toISOString();
    const expiresAt = new Date(
        now.getTime() + prepared.timeoutSec * 1_000
    ).toISOString();
    const request: ApprovalRequest = {
        id: `apr_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        status: 'pending',
        createdAt,
        expiresAt,
        ...prepared
    };
    writeRequest(request);
    return request;
}

export function readApprovalRequest(id: string): ApprovalRequest | null {
    const path = getRequestPath(id);
    if (!existsSync(path)) return null;
    return readJsonFile<ApprovalRequest>(path);
}

export function listApprovalRequests(): ApprovalRequest[] {
    ensureApprovalStateDirs();
    return readdirSync(getApprovalRequestsDir())
        .filter((name) => name.endsWith('.json'))
        .map((name) => readJsonFile<ApprovalRequest>(join(getApprovalRequestsDir(), name)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listPendingApprovalRequests(): ApprovalRequest[] {
    return listApprovalRequests().filter((request) => request.status === 'pending');
}

export function countPendingApprovalRequests(): number {
    return listPendingApprovalRequests().length;
}

function appendAuditRecord(request: ApprovalRequest): void {
    if (!request.decision) return;
    const date = request.decision.decidedAt.slice(0, 10);
    const line = JSON.stringify({
        id: request.id,
        status: request.status,
        decidedAt: request.decision.decidedAt,
        actor: request.decision.actor,
        endpointId: request.endpointId,
        workspaceName: request.workspaceName,
        payloadDigest: request.payloadDigest,
        summary: request.summary
    });
    ensureApprovalStateDirs();
    writeFileSync(getAuditPath(date), `${line}\n`, {
        encoding: 'utf-8',
        flag: 'a'
    });
}

function buildDecision(
    status: Exclude<ApprovalStatus, 'pending'>,
    actor: ApprovalActor,
    note?: string,
    decidedAt = new Date().toISOString()
): ApprovalDecision {
    return {
        status,
        actor,
        decidedAt,
        ...(note ? { note } : {})
    };
}

export function decideApprovalRequest(
    id: string,
    status: 'approved' | 'rejected' | 'cancelled',
    actor: ApprovalActor,
    note?: string
): ApprovalRequest | null {
    const request = readApprovalRequest(id);
    if (!request) return null;
    if (request.status !== 'pending') return request;
    request.status = status;
    request.decision = buildDecision(status, actor, note);
    writeRequest(request);
    appendAuditRecord(request);
    return request;
}

export function expireTimedOutApprovalRequests(
    now = new Date().toISOString()
): ApprovalRequest[] {
    const expired: ApprovalRequest[] = [];
    for (const request of listPendingApprovalRequests()) {
        if (request.expiresAt > now) continue;
        request.status = 'timed_out';
        request.decision = buildDecision('timed_out', 'caller', undefined, now);
        writeRequest(request);
        appendAuditRecord(request);
        expired.push(request);
    }
    return expired;
}

export function cancelAllPendingApprovalRequests(): ApprovalRequest[] {
    const cancelled: ApprovalRequest[] = [];
    for (const request of listPendingApprovalRequests()) {
        request.status = 'cancelled';
        request.decision = buildDecision('cancelled', 'caller');
        writeRequest(request);
        appendAuditRecord(request);
        cancelled.push(request);
    }
    return cancelled;
}

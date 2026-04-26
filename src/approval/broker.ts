import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import {
    cancelAllPendingApprovalRequests,
    countPendingApprovalRequests,
    createApprovalRequest,
    decideApprovalRequest,
    expireTimedOutApprovalRequests,
    listApprovalRequests,
    listPendingApprovalRequests,
    readApprovalRequest
} from './store.js';
import {
    HARD_IDLE_TIMEOUT_MS,
    QUEUE_EMPTY_GRACE_MS
} from './runtime.js';
import {
    cleanupApprovalBrokerState,
    readBrokerPort,
    writeBrokerState
} from './broker-paths.js';
import { openApprovalBrowser } from './broker-browser.js';
import { renderApprovalCenter } from './ui.js';
import type {
    ApprovalActor,
    ApprovalBrokerStatus,
    ApprovalDecision,
    ApprovalRequest,
    PreparedApprovalRequest
} from './types.js';

interface Waiter {
    resolve: (decision: ApprovalDecision) => void;
}

function json(res: ServerResponse, statusCode: number, body: unknown): void {
    res.statusCode = statusCode;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
}

function text(res: ServerResponse, statusCode: number, body: string): void {
    res.statusCode = statusCode;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown;
}

function requireToken(req: IncomingMessage, expectedToken: string): boolean {
    return req.headers['x-siyuan-approval-token'] === expectedToken;
}

export async function startApprovalBroker(port = 0): Promise<void> {
    const brokerToken = process.env['SIYUAN_APPROVAL_BROKER_TOKEN'];
    if (!brokerToken) {
        throw new Error('Missing SIYUAN_APPROVAL_BROKER_TOKEN for approval broker startup.');
    }

    const waiters = new Map<string, Set<Waiter>>();
    let graceTimer: NodeJS.Timeout | null = null;
    let lastWorkAt = Date.now();

    function waiterCount(): number {
        return [...waiters.values()].reduce((sum, set) => sum + set.size, 0);
    }

    function resolveWaiters(request: ApprovalRequest): void {
        if (!request.decision) return;
        const set = waiters.get(request.id);
        if (!set) return;
        for (const waiter of set) {
            try {
                waiter.resolve(request.decision);
            } catch (error) {
                process.stderr.write(
                    JSON.stringify({
                        warning: 'APPROVAL_WAITER_RESOLVE_FAILED',
                        requestId: request.id,
                        message: error instanceof Error ? error.message : String(error)
                    }) + '\n'
                );
            }
        }
        waiters.delete(request.id);
    }

    function touchWork(): void {
        lastWorkAt = Date.now();
    }

    async function shutdown(server: ReturnType<typeof createServer>): Promise<void> {
        for (const request of cancelAllPendingApprovalRequests()) {
            resolveWaiters(request);
        }
        if (graceTimer) clearTimeout(graceTimer);
        cleanupApprovalBrokerState();
        server.close(() => {
            process.exit(0);
        });
    }

    function refreshLifecycle(server: ReturnType<typeof createServer>): void {
        const pendingCount = countPendingApprovalRequests();
        const activeWaiters = waiterCount();
        if (pendingCount === 0 && activeWaiters === 0) {
            if (!graceTimer) {
                graceTimer = setTimeout(() => {
                    void shutdown(server);
                }, QUEUE_EMPTY_GRACE_MS);
            }
        } else if (graceTimer) {
            clearTimeout(graceTimer);
            graceTimer = null;
        }

        if (
            pendingCount === 0 &&
            activeWaiters === 0 &&
            Date.now() - lastWorkAt >= HARD_IDLE_TIMEOUT_MS
        ) {
            void shutdown(server);
        }
    }

    const server = createServer(async (req, res) => {
        try {
            const method = req.method ?? 'GET';
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            const path = url.pathname;

            if (method === 'GET' && path === '/approval') {
                if (url.searchParams.get('token') !== brokerToken) {
                    json(res, 403, { error: 'APPROVAL_FORBIDDEN' });
                    return;
                }
                text(res, 200, renderApprovalCenter(brokerToken));
                return;
            }

            if (method === 'GET' && path === '/api/approval/status') {
                const status: ApprovalBrokerStatus = {
                    running: true,
                    pid: process.pid,
                    port: readBrokerPort(),
                    pendingCount: countPendingApprovalRequests(),
                    waiterCount: waiterCount()
                };
                json(res, 200, status);
                return;
            }

            if (method === 'GET' && path === '/api/approval/requests') {
                json(res, 200, {
                    pending: listPendingApprovalRequests(),
                    recent: listApprovalRequests().slice(0, 20)
                });
                return;
            }

            if (method === 'POST' && path === '/api/approval/requests') {
                if (!requireToken(req, brokerToken)) {
                    json(res, 403, { error: 'APPROVAL_FORBIDDEN' });
                    return;
                }
                const body = (await readBody(req)) as PreparedApprovalRequest & {
                    autoOpen?: boolean;
                };
                const { autoOpen = true, ...prepared } = body;
                const request = createApprovalRequest(prepared);
                touchWork();
                refreshLifecycle(server);
                const brokerPort = readBrokerPort()!;
                const urlBase = `http://127.0.0.1:${brokerPort}`;
                const approvalUrl = `${urlBase}/approval?token=${encodeURIComponent(brokerToken)}`;
                if (autoOpen && countPendingApprovalRequests() === 1) {
                    await openApprovalBrowser(approvalUrl);
                }
                json(res, 200, {
                    requestId: request.id,
                    status: request.status,
                    url: approvalUrl,
                    expiresAt: request.expiresAt
                });
                return;
            }

            const requestMatch = /^\/api\/approval\/requests\/([^/]+)$/.exec(path);
            if (method === 'GET' && requestMatch) {
                const request = readApprovalRequest(requestMatch[1]!);
                if (!request) {
                    json(res, 404, { error: 'APPROVAL_NOT_FOUND' });
                    return;
                }
                json(res, 200, request);
                return;
            }

            const waitMatch = /^\/api\/approval\/requests\/([^/]+)\/wait$/.exec(path);
            if (method === 'GET' && waitMatch) {
                const requestId = waitMatch[1]!;
                const request = readApprovalRequest(requestId);
                if (!request) {
                    json(res, 404, { error: 'APPROVAL_NOT_FOUND' });
                    return;
                }
                if (request.status !== 'pending' && request.decision) {
                    json(res, 200, request.decision);
                    return;
                }
                touchWork();
                const timeoutMs = Number.parseInt(
                    url.searchParams.get('timeoutMs') ?? '61000',
                    10
                );
                const set = waiters.get(requestId) ?? new Set<Waiter>();
                const timer = setTimeout(() => {
                    set.delete(waiter);
                    if (set.size === 0) waiters.delete(requestId);
                    json(res, 504, { error: 'APPROVAL_WAIT_TIMEOUT' });
                    refreshLifecycle(server);
                }, timeoutMs);
                const waiter: Waiter = {
                    resolve: (decision) => {
                        clearTimeout(timer);
                        json(res, 200, decision);
                        set.delete(waiter);
                        if (set.size === 0) waiters.delete(requestId);
                        refreshLifecycle(server);
                    }
                };
                set.add(waiter);
                waiters.set(requestId, set);
                req.on('close', () => {
                    clearTimeout(timer);
                    set.delete(waiter);
                    if (set.size === 0) waiters.delete(requestId);
                    refreshLifecycle(server);
                });
                refreshLifecycle(server);
                return;
            }

            const decisionMatch =
                /^\/api\/approval\/requests\/([^/]+)\/(approve|reject|cancel)$/.exec(path);
            if (method === 'POST' && decisionMatch) {
                if (!requireToken(req, brokerToken)) {
                    json(res, 403, { error: 'APPROVAL_FORBIDDEN' });
                    return;
                }
                const [, requestId, action] = decisionMatch;
                const body = (await readBody(req)) as {
                    actor?: ApprovalActor;
                    note?: string;
                };
                const status =
                    action === 'approve'
                        ? 'approved'
                        : action === 'reject'
                          ? 'rejected'
                          : 'cancelled';
                const request = decideApprovalRequest(
                    requestId!,
                    status,
                    body.actor ?? (action === 'cancel' ? 'caller' : 'human-cli'),
                    body.note
                );
                if (!request) {
                    json(res, 404, { error: 'APPROVAL_NOT_FOUND' });
                    return;
                }
                touchWork();
                resolveWaiters(request);
                refreshLifecycle(server);
                json(res, 200, request);
                return;
            }

            if (method === 'POST' && path === '/api/approval/shutdown') {
                if (!requireToken(req, brokerToken)) {
                    json(res, 403, { error: 'APPROVAL_FORBIDDEN' });
                    return;
                }
                json(res, 200, { ok: true });
                await shutdown(server);
                return;
            }

            json(res, 404, { error: 'APPROVAL_ROUTE_NOT_FOUND', path, method });
        } catch (error) {
            json(res, 500, {
                error: 'APPROVAL_BROKER_ERROR',
                message: error instanceof Error ? error.message : String(error)
            });
        }
    });

    setInterval(() => {
        for (const request of expireTimedOutApprovalRequests()) {
            resolveWaiters(request);
            touchWork();
        }
        refreshLifecycle(server);
    }, 500).unref();

    process.on('SIGINT', () => {
        void shutdown(server);
    });
    process.on('SIGTERM', () => {
        void shutdown(server);
    });

    await new Promise<void>((resolve) => {
        server.listen(port, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                throw new Error('Approval broker did not bind to a TCP port.');
            }
            writeBrokerState(process.pid, address.port, brokerToken);
            resolve();
        });
    });
}

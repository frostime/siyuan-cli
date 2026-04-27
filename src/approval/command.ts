/**
 * Approval CLI commands: definitions + implementations.
 *
 * Command implementations were consolidated here from client.ts
 * to keep client.ts focused on business logic.
 */
import { defineCommand } from 'citty';
import { ensureBroker, startApprovalBroker } from './index.js';
import { fatalError, toCliError } from '../shared/errors.js';
import { getRunningBroker } from './runtime.js';
import { openApprovalBrowser } from './broker-browser.js';
import { ApprovalBrokerUnavailableError } from './errors.js';
import type { ApprovalResolvedBroker } from './types.js';

// ── Local helpers ────────────────────────────────────────────────────────────

function out(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function tryRun(fn: () => Promise<void>): Promise<void> {
    return fn().catch((error) => fatalError(toCliError(error)));
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
    const body = (await response.json()) as unknown;
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

async function requireRunningBroker(requestId?: string): Promise<ApprovalResolvedBroker> {
    const broker = await getRunningBroker();
    if (!broker) {
        throw new ApprovalBrokerUnavailableError(
            'Approval broker is not running.',
            requestId ? { requestId } : undefined
        );
    }
    return broker;
}

// ── Command implementations ──────────────────────────────────────────────────

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

async function getApproval(requestId: string): Promise<unknown> {
    const broker = await requireRunningBroker(requestId);
    const response = await fetch(`${broker.baseUrl}/api/approval/requests/${requestId}`);
    return readJsonOrThrow(response);
}

async function postDecision(
    requestId: string,
    action: 'approve' | 'reject',
    note?: string
): Promise<unknown> {
    const broker = await requireRunningBroker(requestId);
    const response = await fetch(
        `${broker.baseUrl}/api/approval/requests/${requestId}/${action}`,
        {
            method: 'POST',
            headers: authHeaders(broker.token),
            body: JSON.stringify({
                actor: 'human-cli',
                ...(note ? { note } : {})
            })
        }
    );
    return readJsonOrThrow(response);
}

async function approveApproval(requestId: string): Promise<unknown> {
    return postDecision(requestId, 'approve');
}

export async function rejectApproval(requestId: string, note?: string): Promise<unknown> {
    return postDecision(requestId, 'reject', note);
}

async function openApprovalCenter(): Promise<{ url: string; opened: boolean }> {
    const broker = await ensureBroker({ autoOpen: false });
    const url = `${broker.baseUrl}/approval?token=${encodeURIComponent(broker.token)}`;
    const opened = await openApprovalBrowser(url);
    return { url, opened };
}

async function stopApprovalBroker(): Promise<{ ok: boolean }> {
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

// ── Command definitions ──────────────────────────────────────────────────────

const statusCommand = defineCommand({
    meta: { name: 'status', description: 'Show local approval broker status.' },
    run: () =>
        tryRun(async () => {
            out(await getBrokerStatus());
        })
});

const listCommand = defineCommand({
    meta: { name: 'list', description: 'List pending and recent approval requests.' },
    run: () =>
        tryRun(async () => {
            out(await listApprovals());
        })
});

const showCommand = defineCommand({
    meta: { name: 'show', description: 'Show one approval request.' },
    args: {
        id: {
            type: 'positional',
            description: 'Approval request id',
            required: true
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            out(await getApproval(args.id));
        })
});

const approveCommand = defineCommand({
    meta: { name: 'approve', description: 'Approve one pending request.' },
    args: {
        id: {
            type: 'positional',
            description: 'Approval request id',
            required: true
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            out(await approveApproval(args.id));
        })
});

const rejectCommand = defineCommand({
    meta: { name: 'reject', description: 'Reject one pending request.' },
    args: {
        id: {
            type: 'positional',
            description: 'Approval request id',
            required: true
        },
        reason: {
            type: 'string',
            description: 'Optional reject reason shown to the caller'
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            out(await rejectApproval(args.id, args.reason));
        })
});

const openCommand = defineCommand({
    meta: { name: 'open', description: 'Open the Approval Center in the browser.' },
    run: () =>
        tryRun(async () => {
            out(await openApprovalCenter());
        })
});

const stopCommand = defineCommand({
    meta: { name: 'stop', description: 'Stop the local approval broker.' },
    run: () =>
        tryRun(async () => {
            out(await stopApprovalBroker());
        })
});

const brokerCommand = defineCommand({
    meta: { name: 'broker', description: 'Internal: start the approval broker.' },
    args: {
        port: {
            type: 'string',
            description: 'TCP port (0 = random)',
            default: '0'
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            await startApprovalBroker(Number.parseInt(args.port, 10) || 0);
        })
});

const startCommand = defineCommand({
    meta: { name: 'start', description: 'Ensure the local approval broker is running.' },
    run: () =>
        tryRun(async () => {
            out(await ensureBroker({ autoOpen: false }));
        })
});

export const approvalCommand = defineCommand({
    meta: {
        name: 'approval',
        description: 'Manage the local human-approval broker and queue.'
    },
    subCommands: {
        status: statusCommand,
        list: listCommand,
        show: showCommand,
        approve: approveCommand,
        reject: rejectCommand,
        open: openCommand,
        stop: stopCommand,
        start: startCommand,
        broker: brokerCommand
    }
});

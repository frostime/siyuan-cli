import { defineCommand } from 'citty';
import {
    approveApproval,
    ensureBroker,
    getApproval,
    getBrokerStatus,
    listApprovals,
    openApprovalCenter,
    rejectApproval,
    startApprovalBroker,
    stopApprovalBroker
} from './index.js';
import { fatalError, toCliError } from '../utils/errors.js';

function out(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function tryRun(fn: () => Promise<void>): Promise<void> {
    return fn().catch((error) => fatalError(toCliError(error)));
}

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
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            out(await rejectApproval(args.id));
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

function withTempConfigDir(fn: () => void | Promise<void>) {
    const dir = mkdtempSync(join(tmpdir(), 'siyuan-approval-client-'));
    process.env['SIYUAN_CLI_CONFIG'] = join(dir, 'config.yaml');
    return Promise.resolve(fn()).finally(() => {
        delete process.env['SIYUAN_CLI_CONFIG'];
        rmSync(dir, { recursive: true, force: true });
    });
}

test('listApprovals does not start broker when none is running', async () => {
    await withTempConfigDir(async () => {
        const client = await import('../src/approval/client.ts');
        const approvals = await client.listApprovals();
        assert.deepEqual(approvals, { pending: [], recent: [] });
    });
});

test('requestAndWait uses one broker instance for create and wait', async () => {
    await withTempConfigDir(async () => {
        const runtime = await import('../src/approval/runtime.ts');
        const client = await import('../src/approval/client.ts');

        runtime.ensureApprovalStateDirs();
        const server = createServer((req, res) => {
            if (req.url === '/api/approval/status') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ running: true }));
                return;
            }
            if (req.url === '/api/approval/requests' && req.method === 'POST') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({
                    requestId: 'apr_test',
                    status: 'pending',
                    url: 'http://127.0.0.1:7788/approval?token=secret',
                    expiresAt: '2026-01-01T00:00:00.000Z'
                }));
                return;
            }
            if (req.url?.startsWith('/api/approval/requests/apr_test/wait')) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'approved',
                    actor: 'human-cli',
                    decidedAt: '2026-01-01T00:00:00.000Z'
                }));
                return;
            }
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'NOT_FOUND', url: req.url }));
        });

        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve());
        });
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        runtime.writeBrokerState(process.pid, address.port, 'secret');

        try {
            const decision = await client.requestAndWait(
                {
                    workspaceName: 'main',
                    endpointId: 'system.currentTime',
                    endpointPath: '/api/system/currentTime',
                    risk: 'confirm',
                    summary: 'Approve current time',
                    payloadPreview: {},
                    payloadDigest: 'sha256:x',
                    resourceSummary: [],
                    timeoutSec: 60
                },
                { autoOpen: false }
            );
            assert.equal(decision.status, 'approved');
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
            runtime.cleanupApprovalBrokerState();
        }
    });
});

test('requestAndWait auto-opens the created approval URL', async () => {
    await withTempConfigDir(async () => {
        const runtime = await import('../src/approval/runtime.ts');
        const client = await import('../src/approval/client.ts');

        runtime.ensureApprovalStateDirs();
        const server = createServer((req, res) => {
            if (req.url === '/api/approval/status') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ running: true }));
                return;
            }
            if (req.url === '/api/approval/requests' && req.method === 'POST') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({
                    requestId: 'apr_open',
                    status: 'pending',
                    url: 'http://127.0.0.1:7788/approval?token=secret-open',
                    expiresAt: '2026-01-01T00:00:00.000Z'
                }));
                return;
            }
            if (req.url?.startsWith('/api/approval/requests/apr_open/wait')) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'approved',
                    actor: 'human-cli',
                    decidedAt: '2026-01-01T00:00:00.000Z'
                }));
                return;
            }
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'NOT_FOUND', url: req.url }));
        });

        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve());
        });
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        runtime.writeBrokerState(process.pid, address.port, 'secret');

        const opened: string[] = [];

        try {
            const decision = await client.requestAndWait(
                {
                    workspaceName: 'main',
                    endpointId: 'system.currentTime',
                    endpointPath: '/api/system/currentTime',
                    risk: 'confirm',
                    summary: 'Approve current time',
                    payloadPreview: {},
                    payloadDigest: 'sha256:x',
                    resourceSummary: [],
                    timeoutSec: 60
                },
                {
                    openBrowser: async (url: string) => {
                        opened.push(url);
                    }
                }
            );
            assert.equal(decision.status, 'approved');
            assert.deepEqual(opened, ['http://127.0.0.1:7788/approval?token=secret-open']);
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
            runtime.cleanupApprovalBrokerState();
        }
    });
});

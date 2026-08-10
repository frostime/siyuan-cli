import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveWorkspaceDirToBaseUrl } from '../src/workspace/resolver.ts';
import { CliError } from '../src/shared/errors.ts';

async function startServer(workspaceDir: string) {
    const requests: Array<{ path: string; authorization?: string }> = [];
    const server = createServer((req, res) => {
        requests.push({
            path: req.url ?? '',
            authorization: req.headers.authorization
        });
        if (
            req.method !== 'POST' ||
            req.url !== '/api/system/getWorkspaceInfo'
        ) {
            res.statusCode = 404;
            res.end();
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(
            JSON.stringify({
                code: 0,
                msg: '',
                data: { workspaceDir, siyuanVer: '3.7.3' }
            })
        );
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    return {
        port: address.port,
        requests,
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            })
    };
}

function writeWorkspaceConfig(workspaceDir: string, port: number): void {
    mkdirSync(join(workspaceDir, 'conf'), { recursive: true });
    writeFileSync(
        join(workspaceDir, 'conf', 'conf.json'),
        JSON.stringify({ serverAddrs: [`http://127.0.0.1:${port}`] }),
        'utf8'
    );
}

test('workspaceDir resolver reads the port from conf.json and verifies it with getWorkspaceInfo', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'siyuan-resolver-'));
    const server = await startServer(workspaceDir);
    writeWorkspaceConfig(workspaceDir, server.port);

    try {
        const result = await resolveWorkspaceDirToBaseUrl(workspaceDir, {
            token: 'test-token'
        });
        assert.equal(result.baseUrl, `http://127.0.0.1:${server.port}`);
        assert.equal(result.workspaceDir, workspaceDir);
        assert.deepEqual(server.requests, [
            {
                path: '/api/system/getWorkspaceInfo',
                authorization: 'Token test-token'
            }
        ]);
    } finally {
        await server.close();
        rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('workspaceDir resolver rejects a port whose runtime workspace does not match', async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'siyuan-resolver-'));
    const otherWorkspaceDir = mkdtempSync(
        join(tmpdir(), 'siyuan-resolver-other-')
    );
    const server = await startServer(otherWorkspaceDir);
    writeWorkspaceConfig(workspaceDir, server.port);

    try {
        await assert.rejects(
            () => resolveWorkspaceDirToBaseUrl(workspaceDir),
            (error: unknown) =>
                error instanceof CliError &&
                error.errorType === 'WORKSPACE_VERIFY_FAILED'
        );
    } finally {
        await server.close();
        rmSync(workspaceDir, { recursive: true, force: true });
        rmSync(otherWorkspaceDir, { recursive: true, force: true });
    }
});

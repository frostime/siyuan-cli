import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type IncomingMessage } from 'node:http';

import {
    callRawEndpoint,
    checkRawApiAllowed,
    normalizeRawEndpoint
} from '../src/api/command.ts';
import { CliError } from '../src/shared/errors.ts';

async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
}

test('raw endpoint normalization accepts id and kernel path', () => {
    assert.deepEqual(normalizeRawEndpoint('system.version'), {
        id: 'system.version',
        endpoint: '/api/system/version'
    });
    assert.deepEqual(normalizeRawEndpoint('/api/system/version'), {
        id: 'system.version',
        endpoint: '/api/system/version'
    });
    assert.throws(() => normalizeRawEndpoint('bad'), /Invalid raw endpoint/);
});

test('raw allowlist rejects empty and unmatched patterns', () => {
    assert.throws(() => checkRawApiAllowed('system.version', []), (error) => {
        assert.equal((error as CliError).errorType, 'RAW_API_ALLOW_REQUIRED');
        return true;
    });
    assert.throws(() => checkRawApiAllowed('system.version', ['attr.*']), (error) => {
        assert.equal((error as CliError).errorType, 'RAW_API_ENDPOINT_DENIED');
        return true;
    });
    assert.doesNotThrow(() => checkRawApiAllowed('system.version', ['system.*']));
});

test('raw command uses config gate and keeps stdout pure JSON with stderr warning', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'siyuan-cli-raw-test-'));
    const server = createServer(async (req, res) => {
        assert.equal(req.method, 'POST');
        assert.equal(req.url, '/api/system/version');
        assert.deepEqual(JSON.parse(await readBody(req)), { ping: true });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 0, msg: '', data: '3.6.5-test' }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.equal(typeof address, 'object');
    const baseUrl = `http://127.0.0.1:${address!.port}`;
    const configPath = join(dir, 'config.yaml');
    await writeFile(
        configPath,
        `schemaVersion: 1\ncurrent: dev\nworkspaces:\n  dev:\n    baseUrl: ${baseUrl}\n    behavior:\n      rawApi:\n        enabled: true\n        allow:\n          - "system.version"\n`,
        'utf8'
    );

    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    let stdout = '';
    let stderr = '';
    process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
    }) as typeof process.stderr.write;

    try {
        await callRawEndpoint({
            config: configPath,
            endpoint: '/api/system/version',
            json: '{"ping":true}'
        });
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
        server.close();
        await rm(dir, { recursive: true, force: true });
    }

    assert.equal(JSON.parse(stdout), '3.6.5-test');
    const warning = JSON.parse(stderr) as { warning: string; endpoint: string };
    assert.equal(warning.warning, 'RAW_API_NO_SCHEMA_GUARD');
    assert.equal(warning.endpoint, 'system.version');
});

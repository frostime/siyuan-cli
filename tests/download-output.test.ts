import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';

import {
    parseMimeType,
    isTextualContentType,
    stripNodeIdSuffix,
    buildTempAssetPath,
    formatByteSize,
    assertOutFileWritable,
    sha256Hex,
    writeDownloadedFile
} from '../src/shared/download-output.ts';
import { SiyuanClient, type DownloadResult } from '../src/shared/client.ts';
import { CliError } from '../src/shared/errors.js';

function makeDownload(bytes: Uint8Array, contentType: string): DownloadResult {
    return {
        contentType,
        body: new Blob([bytes]).stream(),
        arrayBuffer: async () => bytes
    };
}

// ————— content-type helpers —————

test('parseMimeType strips parameters and falls back to octet-stream', () => {
    assert.equal(parseMimeType('text/markdown; charset=utf-8'), 'text/markdown');
    assert.equal(parseMimeType('image/png'), 'image/png');
    assert.equal(parseMimeType(''), 'application/octet-stream');
});

test('isTextualContentType: text/* and explicit textual types', () => {
    for (const ct of ['text/plain', 'text/markdown; charset=utf-8', 'application/json', 'application/xml', 'image/svg+xml']) {
        assert.ok(isTextualContentType(ct), ct);
    }
    for (const ct of ['image/png', 'application/pdf', 'application/octet-stream', 'video/mp4']) {
        assert.ok(!isTextualContentType(ct), ct);
    }
});

// ————— file name / temp path —————

test('stripNodeIdSuffix removes the SiYuan node id suffix', () => {
    assert.equal(stripNodeIdSuffix('foo-20240922152051-7dpjfpv.png'), 'foo.png');
    assert.equal(stripNodeIdSuffix('plain.md'), 'plain.md');
});

test('buildTempAssetPath keeps extension and namespaces under siyuan-cli/assets', () => {
    const p = buildTempAssetPath('data/assets/foo-20240922152051-7dpjfpv.png', '/tmp/base', 'abcd1234');
    const expected = resolve('/tmp/base', 'siyuan-cli', 'assets', 'foo-abcd1234.png');
    assert.equal(p, expected);
});

test('formatByteSize renders human units', () => {
    assert.equal(formatByteSize(512), '512 B');
    assert.equal(formatByteSize(12589), '12.3 KB');
    assert.equal(formatByteSize(3 * 1024 * 1024), '3.0 MB');
});

// ————— overwrite guard —————

test('assertOutFileWritable refuses existing target without --yes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dl-out-test-'));
    try {
        const existing = join(dir, 'exists.bin');
        writeFileSync(existing, 'x');
        assert.throws(
            () => assertOutFileWritable(existing, false),
            (e: unknown) => e instanceof CliError && e.errorType === 'OUT_FILE_EXISTS'
        );
        // With --yes it must pass; with a fresh path it must pass.
        assertOutFileWritable(existing, true);
        assertOutFileWritable(join(dir, 'new.bin'), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

// ————— output routing behavior matrix —————

test('writeDownloadedFile: binary + outFile streams to file with correct sha256', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const out = join(mkdtempSync(join(tmpdir(), 'dl-out-test-')), 'out.bin');
    const result = await writeDownloadedFile({
        download: makeDownload(bytes, 'application/octet-stream'),
        fileName: 'data/assets/foo-20240922152051-7dpjfpv.bin',
        kernelPath: 'data/assets/foo-20240922152051-7dpjfpv.bin',
        outFile: out,
        yes: false,
        jsonMode: false
    });
    assert.ok(existsSync(out));
    assert.deepEqual(readFileSync(out), Buffer.from(bytes));
    assert.equal(result.data.savedTo, resolve(out));
    assert.equal(result.data.sha256, sha256Hex(bytes));
    assert.equal(result.data.tempFile, undefined);
    assert.match(result.compact, /^Saved to /);
    rmSync(result.data.savedTo!, { force: true });
});

test('writeDownloadedFile: binary without outFile goes to namespaced temp file with hint', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const result = await writeDownloadedFile({
        download: makeDownload(bytes, 'image/png'),
        fileName: 'data/assets/photo-20240922152051-7dpjfpv.png',
        jsonMode: false
    });
    assert.equal(result.data.tempFile, true);
    assert.ok(result.data.savedTo!.includes(join('siyuan-cli', 'assets')));
    assert.ok(result.data.savedTo!.endsWith('.png'));
    assert.deepEqual(readFileSync(result.data.savedTo!), Buffer.from(bytes));
    assert.match(result.compact, /Binary content saved to:/);
    assert.match(result.compact, /pass --outFile to keep it/);
    rmSync(result.data.savedTo!, { force: true });
});

test('writeDownloadedFile: text without outFile prints content', async () => {
    const bytes = new TextEncoder().encode('# hello\n');
    const result = await writeDownloadedFile({
        download: makeDownload(bytes, 'text/markdown; charset=utf-8'),
        fileName: 'note.md',
        jsonMode: false
    });
    assert.equal(result.compact, '# hello\n');
    assert.equal(result.data.content, '# hello\n');
    assert.equal(result.data.tempFile, undefined);
});

test('writeDownloadedFile: json mode embeds small text, spills oversized text to temp file', async () => {
    const small = new TextEncoder().encode('hello');
    const smallResult = await writeDownloadedFile({
        download: makeDownload(small, 'text/plain'),
        fileName: 'note.txt',
        jsonMode: true
    });
    assert.equal(smallResult.data.content, 'hello');
    assert.equal(smallResult.data.savedTo, undefined);

    const big = new TextEncoder().encode('x'.repeat(64));
    const spill = await writeDownloadedFile({
        download: makeDownload(big, 'text/plain'),
        fileName: 'big.txt',
        jsonMode: true,
        textEmbedLimit: 16
    });
    assert.equal(spill.data.tempFile, true);
    assert.equal(spill.data.content, undefined);
    assert.ok(existsSync(spill.data.savedTo!));
    rmSync(spill.data.savedTo!, { force: true });
});

test('writeDownloadedFile: json mode never embeds binary bytes', async () => {
    const bytes = new Uint8Array([0, 159, 146, 150]);
    const result = await writeDownloadedFile({
        download: makeDownload(bytes, 'image/png'),
        fileName: 'x.png',
        jsonMode: true
    });
    assert.equal(result.data.content, undefined);
    assert.ok(result.data.savedTo!.endsWith('.png'));
    rmSync(result.data.savedTo!, { force: true });
});

test('writeDownloadedFile: null body produces empty file', async () => {
    const result = await writeDownloadedFile({
        download: { contentType: 'application/octet-stream', body: null, arrayBuffer: async () => new Uint8Array(0) },
        fileName: 'empty.bin',
        outFile: join(mkdtempSync(join(tmpdir(), 'dl-out-test-')), 'empty.bin'),
        jsonMode: false
    });
    assert.equal(result.data.size, 0);
    rmSync(result.data.savedTo!, { force: true });
});

// ————— SiyuanClient.download —————

const client = new SiyuanClient({ baseUrl: 'http://127.0.0.1:1', token: 't' });

test('client.download: 200 returns bytes and contentType', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch;
    try {
        const result = await client.download('/api/file/getFile', { path: 'data/assets/x.png' });
        assert.equal(result.contentType, 'image/png');
        assert.deepEqual(await result.arrayBuffer(), bytes);
        assert.ok(result.body);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('client.download: HTTP 202 + JSON envelope becomes KERNEL_ERROR', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(JSON.stringify({ code: 404, msg: 'file not found', data: null }), {
            status: 202,
            headers: { 'content-type': 'application/json; charset=utf-8' }
        })) as typeof fetch;
    try {
        await assert.rejects(
            () => client.download('/api/file/getFile', { path: 'data/assets/none.png' }),
            (e: unknown) =>
                e instanceof CliError &&
                e.errorType === 'KERNEL_ERROR' &&
                e.message.includes('file not found')
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('client.download: 401 becomes UNAUTHORIZED', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch;
    try {
        await assert.rejects(
            () => client.download('/api/file/getFile', {}),
            (e: unknown) => e instanceof CliError && e.errorType === 'UNAUTHORIZED'
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

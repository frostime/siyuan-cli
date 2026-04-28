import test from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    statSync,
    utimesSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import {
    CACHE_VERSION,
    buildEndpointSchemaFromCache,
    buildToolSchemaFromCache,
    readSchemaCache,
    writeSchemaCache,
    type EndpointSchemaCache,
    type ToolSchemaCache
} from '../src/extension/cache.ts';
import {
    discoverEndpointExtensions,
    discoverToolExtensions,
    validateEndpointExport,
    validateToolExport
} from '../src/extension/loader.ts';
import { EndpointRegistry } from '../src/api/registry.ts';
import { ToolRegistry } from '../src/tool/registry.ts';
import { detectPackageRoot, scaffoldExtensionDir } from '../src/extension/init.ts';

function makeTempDir(name: string): string {
    const dir = join(tmpdir(), `siyuan-cli-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

test('writeSchemaCache/readSchemaCache round-trip tool cache and stale detection', () => {
    const dir = makeTempDir('tool-cache');
    const source = join(dir, 'my-tool.ts');
    writeFileSync(source, 'export const tool = {}\n', 'utf-8');

    const tool = {
        id: 'my-tool',
        summary: 'My tool',
        tags: ['read'],
        input: { type: 'object', properties: {} },
        async run() {
            return { content: 'ok' };
        }
    } as const;

    const cachePath = writeSchemaCache(source, tool as any);
    assert.equal(existsSync(cachePath), true);

    const parsed = JSON.parse(readFileSync(cachePath, 'utf-8'));
    assert.equal(parsed._version, CACHE_VERSION);
    assert.equal(parsed.data.id, 'my-tool');

    const fresh = readSchemaCache<ToolSchemaCache>(source);
    assert.equal(fresh.status, 'cached');
    assert.equal(fresh.data?.id, 'my-tool');

    const future = new Date(statSync(cachePath).mtimeMs + 5000);
    utimesSync(source, future, future);
    const stale = readSchemaCache<ToolSchemaCache>(source);
    assert.equal(stale.status, 'stale');

    rmSync(dir, { recursive: true, force: true });
});

test('readSchemaCache marks version mismatch as stale', () => {
    const dir = makeTempDir('endpoint-cache');
    const source = join(dir, 'custom-endpoint.ts');
    writeFileSync(source, 'export const schema = {}\n', 'utf-8');
    const cachePath = source.replace(/\.ts$/, '.schema.json');
    writeFileSync(
        cachePath,
        JSON.stringify({
            _version: 0,
            _meta: { sourceFile: 'custom-endpoint.ts', cachedAt: new Date().toISOString() },
            data: { endpoint: '/api/custom/run', summary: 'Custom', payload: { type: 'object', properties: {} }, classification: { mode: 'read', surface: 'meta', scope: 'single' } }
        }),
        'utf-8'
    );

    const result = readSchemaCache<EndpointSchemaCache>(source);
    assert.equal(result.status, 'stale');

    rmSync(dir, { recursive: true, force: true });
});

test('discoverToolExtensions/discoverEndpointExtensions honor scan rules', () => {
    const root = makeTempDir('discover');
    const toolDir = join(root, 'tools');
    const apiDir = join(root, 'apis');
    mkdirSync(toolDir, { recursive: true });
    mkdirSync(apiDir, { recursive: true });

    writeFileSync(join(toolDir, 'a.ts'), 'export const tool = {}\n');
    writeFileSync(join(toolDir, 'a.schema.json'), '{}\n');
    writeFileSync(join(toolDir, 'a.d.ts'), 'export {}\n');
    writeFileSync(join(toolDir, 'a.test.ts'), 'export {}\n');
    writeFileSync(join(apiDir, 'b.mjs'), 'export const schema = {}\n');

    const tools = discoverToolExtensions(toolDir);
    const apis = discoverEndpointExtensions(apiDir);

    assert.deepEqual(tools.map((item) => item.source.endsWith('a.ts')), [true]);
    assert.deepEqual(apis.map((item) => item.source.endsWith('b.mjs')), [true]);

    rmSync(root, { recursive: true, force: true });
});

test('validateToolExport and validateEndpointExport reject malformed exports', () => {
    assert.throws(() => validateToolExport({}, 'bad-tool.ts'), /missing export `tool`/i);
    assert.throws(
        () => validateToolExport({ tool: { id: 'x', input: {} } }, 'bad-tool.ts'),
        /tool.run must be a function/i
    );

    assert.throws(() => validateEndpointExport({}, 'bad-api.ts'), /missing export `schema`/i);
    assert.throws(
        () => validateEndpointExport({ schema: { endpoint: '/api/x/y', payload: {} } }, 'bad-api.ts'),
        /schema.classification must be an object/i
    );
});

test('registerExtension warns and skips builtin conflicts, accepts unique ids', () => {
    const toolRegistry = new ToolRegistry();
    const endpointRegistry = new EndpointRegistry();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg?: unknown) => warnings.push(String(msg));

    try {
        toolRegistry.register({
            id: 'builtin-tool',
            summary: 'Builtin',
            input: { type: 'object', properties: {} },
            async run() {
                return { content: 'ok' };
            }
        });
        assert.equal(
            toolRegistry.registerExtension({
                id: 'builtin-tool',
                summary: 'Ext',
                input: { type: 'object', properties: {} },
                async run() {
                    return { content: 'ok' };
                }
            }),
            false
        );
        assert.equal(warnings.some((msg) => msg.includes('conflicts with builtin')), true);
        assert.equal(
            toolRegistry.registerExtension({
                id: 'unique-tool',
                summary: 'Ext',
                input: { type: 'object', properties: {} },
                async run() {
                    return { content: 'ok' };
                }
            }),
            true
        );
        assert.equal(toolRegistry.get('unique-tool')?.summary, 'Ext');

        endpointRegistry.register({
            endpoint: '/api/system/version',
            summary: 'Builtin',
            payload: { type: 'object', properties: {} },
            classification: { mode: 'read', surface: 'meta', scope: 'single' }
        });
        assert.equal(
            endpointRegistry.registerExtension({
                endpoint: '/api/system/version',
                summary: 'Ext',
                payload: { type: 'object', properties: {} },
                classification: { mode: 'read', surface: 'meta', scope: 'single' }
            }),
            false
        );
        assert.equal(
            endpointRegistry.registerExtension({
                endpoint: '/api/custom/run',
                summary: 'Ext',
                payload: { type: 'object', properties: {} },
                classification: { mode: 'read', surface: 'meta', scope: 'single' }
            }),
            true
        );
        assert.equal(endpointRegistry.get('custom.run')?.schema.summary, 'Ext');
    } finally {
        console.warn = originalWarn;
    }
});

test('build schema from cache recreates registry-friendly shapes', () => {
    const tool = buildToolSchemaFromCache({
        id: 'cached-tool',
        summary: 'Cached tool',
        input: { type: 'object', properties: {} }
    });
    assert.equal(tool.id, 'cached-tool');
    assert.rejects(() => tool.run({} as any, {}), /registered from cache only/);

    const endpoint = buildEndpointSchemaFromCache({
        endpoint: '/api/custom/ping',
        summary: 'Ping',
        payload: { type: 'object', properties: {} },
        classification: { mode: 'read', surface: 'meta', scope: 'single' }
    });
    assert.equal(endpoint.endpoint, '/api/custom/ping');
});

test('scaffoldExtensionDir creates tsconfig/gitignore/gitkeep with detected package path', () => {
    const root = makeTempDir('init');
    const result = scaffoldExtensionDir(root);
    assert.equal(existsSync(join(root, '.gitignore')), true);
    assert.equal(existsSync(join(root, 'tsconfig.json')), true);
    assert.equal(existsSync(join(root, 'apis', '.gitkeep')), true);
    assert.equal(existsSync(join(root, 'tools', '.gitkeep')), true);
    assert.ok(result.created.length >= 4);

    const tsconfig = readFileSync(join(root, 'tsconfig.json'), 'utf-8');
    assert.match(tsconfig, /@frostime\/siyuan-cli/);
    assert.match(tsconfig, new RegExp(detectPackageRoot().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\/g, '/')));

    rmSync(root, { recursive: true, force: true });
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { EndpointRegistry } from '../src/api/registry.ts';
import {
    PermissionEngine,
    BlockNotFoundError,
    ContentDeniedError,
    cascadePermission
} from '../src/shared/permission.ts';
import { applyPayloadGuard } from '../src/api/guard.ts';
import { createJsonPrintExtra, preparePrintedOutput } from '../src/shared/output.ts';
import type { AppConfig, PermissionConfig } from '../src/workspace/config.ts';
import {
    evaluatePointerPath,
    isTerminalFilterCompatiblePointerPath,
    PointerPathShapeError,
    runPointerFilterTerminal,
    type EndpointSchema,
    type PermissionEngineLike
} from '../src/shared/schema.ts';

function makeConfig(permission?: PermissionConfig): AppConfig {
    return {
        schemaVersion: 1,
        current: 'local',
        workspaces: {
            local: {
                baseUrl: 'http://127.0.0.1:6806',
                ...(permission ? { permission } : {})
            }
        }
    };
}

function makeEngine(client: any, permission?: PermissionConfig) {
    const config = makeConfig(permission);
    const { rules, defaultEffect } = cascadePermission(config, 'local');
    const engine = new PermissionEngine(rules, defaultEffect, client);
    return { config, engine };
}

test('registry derives meta from authored classification', () => {
    const registry = new EndpointRegistry();
    const schema: EndpointSchema = {
        endpoint: '/api/query/sql',
        summary: 'SQL',
        payload: { type: 'object', properties: { stmt: { type: 'string' } } },
        classification: {
            mode: 'read',
            surface: 'content',
            scope: 'global',
            operation: 'query'
        },
        guard: {
            response: {
                itemsAt: 'blocks[*]',
                fieldMap: { id: 'id', path: 'path', notebook: 'box' }
            }
        }
    };

    registry.register(schema);
    const entry = registry.get('query.sql')!;
    assert.deepEqual(entry.meta.classification, {
        action: 'read',
        domain: 'content',
        cardinality: 'global'
    });
    assert.equal(entry.meta.severity, 'medium');
    assert.ok(entry.meta.tags.includes('action:read'));
});

test('new classification derives high severity for process-exit concern', () => {
    const registry = new EndpointRegistry();
    registry.register({
        endpoint: '/api/system/exit',
        summary: 'Exit',
        payload: { type: 'object', properties: {} },
        classification: {
            action: 'invoke',
            domain: 'runtime',
            concerns: ['process-exit'],
            cardinality: 'single'
        }
    });
    const entry = registry.get('system.exit')!;
    assert.equal(entry.meta.severity, 'high');
    assert.ok(entry.meta.tags.includes('concern:process-exit'));
});

test('global read endpoint without response guard fails loud', () => {
    const registry = new EndpointRegistry();
    assert.throws(() => {
        registry.register({
            endpoint: '/api/query/sql',
            summary: 'SQL',
            payload: {
                type: 'object',
                properties: { stmt: { type: 'string' } }
            },
            classification: {
                mode: 'read',
                surface: 'content',
                scope: 'global',
                operation: 'query'
            }
        });
    }, /global read/);
});

test('schema without classification fails loud', () => {
    const registry = new EndpointRegistry();
    assert.throws(() => {
        registry.register({
            endpoint: '/api/system/version',
            summary: 'Version',
            payload: { type: 'object', properties: {} }
        });
    }, /must declare classification/);
});

test('response.itemsAt must be terminal-filter compatible', () => {
    const registry = new EndpointRegistry();
    assert.throws(() => {
        registry.register({
            endpoint: '/api/query/sql',
            summary: 'SQL',
            payload: {
                type: 'object',
                properties: { stmt: { type: 'string' } }
            },
            classification: {
                mode: 'read',
                surface: 'content',
                scope: 'global',
                operation: 'query'
            },
            guard: {
                response: {
                    itemsAt: 'pages[*].blocks[*]',
                    fieldMap: { path: 'path' }
                }
            }
        });
    }, /not compatible with declarative terminal filtering/);
});

test('payloadTargets field must exist in payload.properties', () => {
    const registry = new EndpointRegistry();
    assert.throws(() => {
        registry.register({
            endpoint: '/api/block/updateBlock',
            summary: 'Update',
            payload: { type: 'object', properties: { id: { type: 'string' } } },
            classification: {
                mode: 'write',
                surface: 'content',
                scope: 'single',
                operation: 'update'
            },
            guard: {
                payloadTargets: [
                    { path: 'missing', kind: 'id', access: 'write' }
                ]
            }
        });
    }, /payloadTargets path root/);
});

test('evaluatePointerPath supports root arrays and nested arrays', () => {
    assert.deepEqual(evaluatePointerPath([{ id: 'a' }, { id: 'b' }], '[*]'), [
        { id: 'a' },
        { id: 'b' }
    ]);
    assert.deepEqual(
        evaluatePointerPath([{ id: 'a' }, { id: 'b' }], '[*].id'),
        ['a', 'b']
    );
    assert.deepEqual(
        evaluatePointerPath(
            { blocks: [{ id: 'a' }, { id: 'b' }] },
            'blocks[*].id'
        ),
        ['a', 'b']
    );
});

test('evaluatePointerPath throws on shape mismatch', () => {
    assert.throws(
        () => evaluatePointerPath({ blocks: {} }, 'blocks[*]'),
        PointerPathShapeError
    );
    assert.throws(
        () => evaluatePointerPath({ blocks: [{ id: 'a' }] }, 'blocks[*].id[*]'),
        PointerPathShapeError
    );
});

test('runPointerFilterTerminal rewrites terminal arrays at any depth', () => {
    const root = { data: { blocks: [{ id: 'a' }, { id: 'b' }] } };
    const out = runPointerFilterTerminal(root, 'data.blocks[*]', (items) =>
        items.slice(0, 1)
    ) as any;
    assert.deepEqual(out, { data: { blocks: [{ id: 'a' }] } });
});

test('runPointerFilterTerminal rejects multiple array expansions', () => {
    assert.equal(isTerminalFilterCompatiblePointerPath('data.blocks[*]'), true);
    assert.equal(
        isTerminalFilterCompatiblePointerPath('pages[*].blocks[*]'),
        false
    );
    assert.throws(
        () =>
            runPointerFilterTerminal(
                { pages: [{ blocks: [{ id: 'a' }] }] },
                'pages[*].blocks[*]',
                (items) => items
            ),
        /supports only one array expansion/
    );
});

test('approval decision uses explicit rule effect only', () => {
    const client = { call: async () => [] } as any;
    const { engine } = makeEngine(client, {
        rules: [
            {
                endpoint: 'block.updateBlock',
                action: 'write',
                effect: 'approval'
            }
        ]
    });

    const wouldRequestApproval = (effect: string): boolean =>
        effect === 'approval';

    const byRule = engine.evaluate({
        endpoint: 'block.updateBlock',
        action: 'write'
    });
    const invokeDefault = engine.evaluate({ endpoint: 'system.exit', action: 'invoke' });
    const plainRead = engine.evaluate({ endpoint: 'query.sql', action: 'read' });

    assert.equal(wouldRequestApproval(byRule), true);
    assert.equal(wouldRequestApproval(invokeDefault), false);
    assert.equal(wouldRequestApproval(plainRead), false);
});

test('resolveContentIds caches and throws BlockNotFoundError for missing ids', async () => {
    let calls = 0;
    const client = {
        call: async (_endpoint: string, payload: { stmt: string }) => {
            calls++;
            if (payload.stmt.includes("'known'")) {
                return [
                    {
                        id: 'known',
                        box: 'nb',
                        path: '/20260107143325-zbrtqup/known.sy'
                    }
                ];
            }
            return [];
        }
    } as any;

    const { engine } = makeEngine(client);
    const one = await engine.resolveContentId('known');
    assert.deepEqual(one, {
        notebook: 'nb',
        path: '/20260107143325-zbrtqup/known.sy'
    });
    assert.equal(calls, 1);

    await engine.resolveContentId('known');
    assert.equal(calls, 1);

    await assert.rejects(
        () => engine.resolveContentIds(['known', 'missing']),
        BlockNotFoundError
    );
    assert.equal(calls, 2);
});

test('endpoint without payloadTargets has no payload guard', async () => {
    const seen: Array<{ kind: string; value: string; access: string }> = [];
    const engine: PermissionEngineLike = {
        checkEndpoint() {},
        checkTool() {},
        async checkContentRef(ref) {
            seen.push(ref);
        },
        async resolveContentIds() {
            return new Map();
        },
        async resolveContentId() {
            return { notebook: 'nb', path: '/x.sy' };
        },
        filterItems(items) {
            return { kept: items, removed: 0, reasons: {} };
        },
    };

    await applyPayloadGuard(
        {
            endpoint: '/api/file/putFile',
            summary: 'Put',
            payload: {
                type: 'object',
                properties: { path: { type: 'string' } }
            },
            classification: {
                mode: 'write',
                surface: 'workspace',
                scope: 'single',
                operation: 'update'
            }
            // no guard.payloadTargets — nothing is checked
        },
        { path: '/workspace/notes.txt' },
        engine,
        'write',
        'workspace'
    );

    assert.deepEqual(seen, []);
});

test('array payload targets reject non-array payload values', async () => {
    const engine: PermissionEngineLike = {
        checkEndpoint() {},
        checkTool() {},
        async checkContentRef() {},
        async resolveContentIds() {
            return new Map();
        },
        async resolveContentId() {
            return { notebook: 'nb', path: '/x.sy' };
        },
        filterItems(items) {
            return { kept: items, removed: 0, reasons: {} };
        }
    };

    await assert.rejects(
        () =>
            applyPayloadGuard(
                {
                    endpoint: '/api/test/arrayRefs',
                    summary: 'Array refs',
                    payload: {
                        type: 'object',
                        properties: {
                            ids: { type: 'array', items: { type: 'string' } }
                        }
                    },
                    classification: {
                        mode: 'write',
                        surface: 'content',
                        scope: 'batch',
                        operation: 'update'
                    },
                    guard: {
                        payloadTargets: [
                            { path: 'ids[*]', kind: 'id', access: 'write' }
                        ]
                    }
                },
                { ids: '/denied/doc.sy' },
                engine,
                'write'
            ),
        /expected array/
    );
});

test('array payload targets reject non-string items', async () => {
    const engine: PermissionEngineLike = {
        checkEndpoint() {},
        checkTool() {},
        async checkContentRef() {},
        async resolveContentIds() {
            return new Map();
        },
        async resolveContentId() {
            return { notebook: 'nb', path: '/x.sy' };
        },
        filterItems(items) {
            return { kept: items, removed: 0, reasons: {} };
        }
    };

    await assert.rejects(
        () =>
            applyPayloadGuard(
                {
                    endpoint: '/api/test/arrayRefs',
                    summary: 'Array refs',
                    payload: {
                        type: 'object',
                        properties: {
                            ids: { type: 'array', items: { type: 'string' } }
                        }
                    },
                    classification: {
                        mode: 'write',
                        surface: 'content',
                        scope: 'batch',
                        operation: 'update'
                    },
                    guard: {
                        payloadTargets: [
                            { path: 'ids[*]', kind: 'id', access: 'write' }
                        ]
                    }
                },
                { ids: ['ok', 1] },
                engine,
                'write'
            ),
        /must resolve to string values/
    );
});

test('array payload targets reject on any denied item', async () => {
    const seen: string[] = [];
    const engine: PermissionEngineLike = {
        checkEndpoint() {},
        checkTool() {},
        async checkContentRef(ref) {
            seen.push(ref.value);
            if (ref.value === 'bad') throw new Error('denied');
        },
        async resolveContentIds() {
            return new Map();
        },
        async resolveContentId() {
            return { notebook: 'nb', path: '/x.sy' };
        },
        filterItems(items) {
            return { kept: items, removed: 0, reasons: {} };
        }
    };

    await assert.rejects(() =>
        applyPayloadGuard(
            {
                endpoint: '/api/test/arrayRefs',
                summary: 'Array refs',
                payload: {
                    type: 'object',
                    properties: {
                        ids: { type: 'array', items: { type: 'string' } }
                    }
                },
                classification: {
                    mode: 'write',
                    surface: 'content',
                    scope: 'batch',
                    operation: 'update'
                },
                guard: {
                    payloadTargets: [
                        { path: 'ids[*]', kind: 'id', access: 'write' }
                    ]
                }
            },
            { ids: ['ok', 'bad', 'later'] },
            engine,
            'write'
        )
    );
    assert.deepEqual(seen, ['ok', 'bad']);
});

test('payload targets reject empty strings unless explicitly marked skipEmpty', async () => {
    const seen: string[] = [];
    const engine: PermissionEngineLike = {
        checkEndpoint() {},
        checkTool() {},
        async checkContentRef(ref) {
            seen.push(ref.value);
        },
        async resolveContentIds() {
            return new Map();
        },
        async resolveContentId() {
            return { notebook: 'nb', path: '/x.sy' };
        },
        filterItems(items) {
            return { kept: items, removed: 0, reasons: {} };
        }
    };

    const schema: EndpointSchema = {
        endpoint: '/api/test/emptyRef',
        summary: 'Empty ref',
        payload: {
            type: 'object',
            properties: {
                requiredID: { type: 'string' },
                optionalID: { type: 'string' }
            }
        },
        classification: {
            mode: 'write',
            surface: 'content',
            scope: 'single',
            operation: 'update'
        },
        guard: {
            payloadTargets: [
                { path: 'requiredID', kind: 'id', access: 'write' },
                { path: 'optionalID', kind: 'id', access: 'write', skipEmpty: true }
            ]
        }
    };

    await applyPayloadGuard(
        schema,
        { requiredID: 'ok', optionalID: '' },
        engine,
        'write'
    );
    assert.deepEqual(seen, ['ok']);

    await assert.rejects(
        () => applyPayloadGuard(schema, { requiredID: '', optionalID: '' }, engine, 'write'),
        /must not be empty/
    );
});

test('preparePrintedOutput wraps json mode into a parseable envelope', () => {
    const extra = createJsonPrintExtra();
    extra.warnings.push({ warning: 'TEST_WARNING' });
    const rendered = preparePrintedOutput({
        print: 'json',
        details: { answer: 42 },
        jsonExtra: extra
    });
    const parsed = JSON.parse(rendered.stdout) as {
        ok: boolean;
        data: { answer: number };
        extra: { warnings: unknown[] };
    };
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, { answer: 42 });
    assert.equal(parsed.extra.warnings.length, 1);
});

test('workspace deny rejects workspace-path refs', async () => {
    const client = { call: async () => [] } as any;
    const { engine } = makeEngine(client, {
        rules: [{ action: 'write', effect: 'deny' }]
    });
    await assert.rejects(
        () =>
            engine.checkContentRef({
                kind: 'workspace-path',
                value: '/workspace/notes.txt',
                access: 'write'
            }),
        ContentDeniedError
    );
});

test('Phase 2 resource-level action:invoke rule matches invoke endpoint with path condition', async () => {
    const client = { call: async () => [] } as any;
    const { engine } = makeEngine(client, {
        rules: [
            { endpoint: 'network.forwardProxy', action: 'invoke', path: '/denied/**', effect: 'deny' }
        ]
    });
    await assert.rejects(
        () =>
            engine.checkContentRef(
                { kind: 'path', value: '/denied/x', access: 'write' },
                { endpoint: 'network.forwardProxy' },
                'invoke'
            ),
        ContentDeniedError
    );
});

test('Phase 2 resource-level action:write rule does NOT match invoke endpoint', async () => {
    const client = { call: async () => [] } as any;
    const { engine } = makeEngine(client, {
        rules: [
            { endpoint: 'network.forwardProxy', action: 'write', path: '/denied/**', effect: 'deny' }
        ]
    });
    const effect = await engine.checkContentRef(
        { kind: 'path', value: '/denied/x', access: 'write' },
        { endpoint: 'network.forwardProxy' },
        'invoke'
    );
    assert.equal(effect, 'allow');
});

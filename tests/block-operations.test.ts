import test from 'node:test';
import assert from 'node:assert/strict';

import { EndpointRegistry } from '../src/api/registry.ts';
import { deriveEndpointId } from '../src/shared/schema.ts';
import {
    PermissionEngine,
    ContentDeniedError,
    cascadePermission
} from '../src/shared/permission.ts';
import { executeEndpoint } from '../src/api/guard.ts';
import type { AppConfig, PermissionConfig } from '../src/workspace/config.ts';
import { schema as attrGetBlockAttrs } from '../src/api/endpoints/attr/getBlockAttrs.ts';
import { schema as attrSetBlockAttrs } from '../src/api/endpoints/attr/setBlockAttrs.ts';
import { schema as blockAppendBlock } from '../src/api/endpoints/block/appendBlock.ts';
import { schema as blockDeleteBlock } from '../src/api/endpoints/block/deleteBlock.ts';
import { schema as blockFoldBlock } from '../src/api/endpoints/block/foldBlock.ts';
import { schema as blockGetBlockBreadcrumb } from '../src/api/endpoints/block/getBlockBreadcrumb.ts';
import { schema as blockGetBlockDOM } from '../src/api/endpoints/block/getBlockDOM.ts';
import { schema as blockGetBlockInfo } from '../src/api/endpoints/block/getBlockInfo.ts';
import { schema as blockGetChildBlocks } from '../src/api/endpoints/block/getChildBlocks.ts';
import { schema as blockInsertBlock } from '../src/api/endpoints/block/insertBlock.ts';
import { schema as blockPrependBlock } from '../src/api/endpoints/block/prependBlock.ts';
import { schema as blockUnfoldBlock } from '../src/api/endpoints/block/unfoldBlock.ts';
import { schema as blockUpdateBlock } from '../src/api/endpoints/block/updateBlock.ts';
import { schema as blockTransferBlockRef } from '../src/api/endpoints/block/transferBlockRef.ts';

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

function registerOne(schema: any) {
    const registry = new EndpointRegistry();
    registry.register(schema);
    const { id } = deriveEndpointId(schema.endpoint);
    return registry.get(id)!;
}

function makeEngine(client: any, permission?: PermissionConfig) {
    const config = makeConfig(permission);
    const { rules, defaultEffect } = cascadePermission(config, 'local');
    const engine = new PermissionEngine(rules, defaultEffect, client);
    return { config, engine };
}

test('batch A1 migrated endpoints use authored classification without tags', () => {
    const migrated = [
        attrGetBlockAttrs,
        attrSetBlockAttrs,
        blockAppendBlock,
        blockDeleteBlock,
        blockFoldBlock,
        blockGetBlockBreadcrumb,
        blockGetBlockDOM,
        blockGetBlockInfo,
        blockGetChildBlocks,
        blockInsertBlock,
        blockPrependBlock,
        blockTransferBlockRef,
        blockUnfoldBlock,
        blockUpdateBlock
    ];

    for (const schema of migrated) {
        assert.ok(
            schema.classification,
            `${schema.endpoint} should define classification`
        );
        const entry = registerOne(schema);
        assert.ok(entry.meta.tags.length > 0);
    }
});

test('insertBlock uses three optional write payload targets', () => {
    assert.deepEqual(blockInsertBlock.guard?.payloadTargets, [
        { path: 'nextID', kind: 'id', access: 'write' },
        { path: 'previousID', kind: 'id', access: 'write' },
        { path: 'parentID', kind: 'id', access: 'write' }
    ]);
    const entry = registerOne(blockInsertBlock);
    assert.equal(entry.meta.classification.mode, 'write');
    assert.equal(entry.meta.classification.operation, 'create');
});

test('getChildBlocks uses batch content read with declarative root-array response filtering', () => {
    const entry = registerOne(blockGetChildBlocks);
    assert.deepEqual(entry.meta.classification, {
        mode: 'read',
        surface: 'content',
        scope: 'batch',
        operation: 'inspect'
    });
    assert.deepEqual(blockGetChildBlocks.guard?.response, {
        itemsAt: '[*]',
        fieldMap: { id: 'id', path: 'path', notebook: 'box' }
    });
});

test('insertBlock denies optional write refs independently', async () => {
    let actualCalls = 0;
    const client = {
        call: async (endpoint: string) => {
            if (endpoint === '/api/query/sql') {
                return [
                    { id: 'parent-ok', box: 'nb', path: '/allowed/doc.sy' },
                    { id: 'prev-denied', box: 'nb', path: '/denied/doc.sy' },
                    { id: 'next-ok', box: 'nb', path: '/allowed/doc.sy' }
                ];
            }
            actualCalls++;
            return { ok: true };
        },
        upload: async () => ({ ok: true })
    } as any;
    const { config, engine } = makeEngine(client, {
        rules: [{ action: 'write', path: '/denied/**', effect: 'deny' }]
    });
    const entry = registerOne(blockInsertBlock);

    await assert.rejects(
        () =>
            executeEndpoint({
                entry,
                payload: {
                    data: 'x',
                    parentID: 'parent-ok',
                    previousID: 'prev-denied',
                    nextID: 'next-ok'
                },
                client,
                engine,
                config
            }),
        ContentDeniedError
    );
    assert.equal(actualCalls, 0);
});

test('transferBlockRef uses array write payload targets', () => {
    assert.deepEqual(blockTransferBlockRef.guard?.payloadTargets, [
        { path: 'fromID', kind: 'id', access: 'write' },
        { path: 'toID', kind: 'id', access: 'write' },
        { path: 'refIDs[*]', kind: 'id', access: 'write' }
    ]);
    const entry = registerOne(blockTransferBlockRef);
    assert.equal(entry.meta.classification.operation, 'move');
});

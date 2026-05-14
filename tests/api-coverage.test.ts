import test from 'node:test';
import assert from 'node:assert/strict';

import { EndpointRegistry } from '../src/api/registry.ts';
import { deriveEndpointId } from '../src/shared/schema.ts';
import { applyResponseGuard, executeEndpoint } from '../src/api/guard.ts';
import {
    PermissionEngine,
    ContentDeniedError,
    cascadePermission
} from '../src/shared/permission.ts';
import type { AppConfig, PermissionConfig } from '../src/workspace/config.ts';

import { schema as assetUpload } from '../src/api/endpoints/asset/upload.ts';
import { schema as convertPandoc } from '../src/api/endpoints/convert/pandoc.ts';
import { schema as exportMdContent } from '../src/api/endpoints/export/exportMdContent.ts';
import { schema as exportResources } from '../src/api/endpoints/export/exportResources.ts';
import { schema as searchFullTextSearchBlock } from '../src/api/endpoints/search/fullTextSearchBlock.ts';
import { schema as templateRender } from '../src/api/endpoints/template/render.ts';
import { schema as templateRenderSprig } from '../src/api/endpoints/template/renderSprig.ts';

import { schema as fileReadDir } from '../src/api/endpoints/file/readDir.ts';
import { schema as fileRemoveFile } from '../src/api/endpoints/file/removeFile.ts';
import { schema as fileRenameFile } from '../src/api/endpoints/file/renameFile.ts';
import { schema as notebookCloseNotebook } from '../src/api/endpoints/notebook/closeNotebook.ts';
import { schema as notebookCreateNotebook } from '../src/api/endpoints/notebook/createNotebook.ts';
import { schema as notebookGetNotebookConf } from '../src/api/endpoints/notebook/getNotebookConf.ts';
import { schema as notebookLsNotebooks } from '../src/api/endpoints/notebook/lsNotebooks.ts';
import { schema as notebookOpenNotebook } from '../src/api/endpoints/notebook/openNotebook.ts';
import { schema as notebookRemoveNotebook } from '../src/api/endpoints/notebook/removeNotebook.ts';
import { schema as notebookRenameNotebook } from '../src/api/endpoints/notebook/renameNotebook.ts';
import { schema as notebookSetNotebookConf } from '../src/api/endpoints/notebook/setNotebookConf.ts';

import { schema as filetreeCreateDailyNote } from '../src/api/endpoints/filetree/createDailyNote.ts';
import { schema as filetreeCreateDocWithMd } from '../src/api/endpoints/filetree/createDocWithMd.ts';
import { schema as filetreeGetHPathByID } from '../src/api/endpoints/filetree/getHPathByID.ts';
import { schema as filetreeGetHPathByPath } from '../src/api/endpoints/filetree/getHPathByPath.ts';
import { schema as filetreeGetIDsByHPath } from '../src/api/endpoints/filetree/getIDsByHPath.ts';
import { schema as filetreeGetPathByID } from '../src/api/endpoints/filetree/getPathByID.ts';
import { schema as filetreeListDocsByPath } from '../src/api/endpoints/filetree/listDocsByPath.ts';
import { schema as filetreeMoveDocs } from '../src/api/endpoints/filetree/moveDocs.ts';
import { schema as filetreeMoveDocsByID } from '../src/api/endpoints/filetree/moveDocsByID.ts';
import { schema as filetreeRemoveDoc } from '../src/api/endpoints/filetree/removeDoc.ts';
import { schema as filetreeRemoveDocByID } from '../src/api/endpoints/filetree/removeDocByID.ts';
import { schema as filetreeRenameDoc } from '../src/api/endpoints/filetree/renameDoc.ts';
import { schema as filetreeRenameDocByID } from '../src/api/endpoints/filetree/renameDocByID.ts';
import { schema as filetreeSearchDocs } from '../src/api/endpoints/filetree/searchDocs.ts';

import { schema as notificationPushErrMsg } from '../src/api/endpoints/notification/pushErrMsg.ts';
import { schema as networkForwardProxy } from '../src/api/endpoints/network/forwardProxy.ts';
import { schema as sqliteFlushTransaction } from '../src/api/endpoints/sqlite/flushTransaction.ts';
import { schema as systemBootProgress } from '../src/api/endpoints/system/bootProgress.ts';
import { schema as systemCurrentTime } from '../src/api/endpoints/system/currentTime.ts';
import { schema as systemGetConf } from '../src/api/endpoints/system/getConf.ts';
import { schema as systemLogoutAuth } from '../src/api/endpoints/system/logoutAuth.ts';
import { schema as systemVersion } from '../src/api/endpoints/system/version.ts';

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
    return registry.get(deriveEndpointId(schema.endpoint).id)!;
}

function makeEngine(client: any, permission?: PermissionConfig) {
    const config = makeConfig(permission);
    const { rules, defaultEffect } = cascadePermission(config, 'local');
    const engine = new PermissionEngine(rules, defaultEffect, client);
    return { config, engine };
}

test('Batches A2-B2-C migrated compatible endpoints to authored classification', () => {
    const migrated = [
        assetUpload,
        convertPandoc,
        exportMdContent,
        searchFullTextSearchBlock,
        templateRender,
        templateRenderSprig,
        exportResources,
        fileReadDir,
        fileRemoveFile,
        fileRenameFile,
        notebookCloseNotebook,
        notebookCreateNotebook,
        notebookGetNotebookConf,
        notebookLsNotebooks,
        notebookOpenNotebook,
        notebookRemoveNotebook,
        notebookRenameNotebook,
        notebookSetNotebookConf,
        filetreeCreateDailyNote,
        filetreeCreateDocWithMd,
        filetreeGetHPathByID,
        filetreeGetHPathByPath,
        filetreeGetIDsByHPath,
        filetreeGetPathByID,
        filetreeListDocsByPath,
        filetreeMoveDocs,
        filetreeMoveDocsByID,
        filetreeRemoveDoc,
        filetreeRemoveDocByID,
        filetreeRenameDoc,
        filetreeRenameDocByID,
        filetreeSearchDocs,
        notificationPushErrMsg,
        networkForwardProxy,
        sqliteFlushTransaction,
        systemBootProgress,
        systemCurrentTime,
        systemGetConf,
        systemLogoutAuth,
        systemVersion
    ];

    for (const schema of migrated) {
        assert.ok(
            schema.classification,
            `${schema.endpoint} should define classification`
        );
        const entry = registerOne(schema);
        assert.equal(
            entry.meta.classification.action,
            'action' in schema.classification!
                ? schema.classification.action
                : schema.classification.mode
        );
    }
});

test('phase 6 holdouts are fully migrated with explicit array targets', () => {
    assert.deepEqual(exportResources.guard?.payloadTargets, [
        { path: 'paths[*]', kind: 'workspace-path', access: 'read' }
    ]);
    assert.deepEqual(filetreeMoveDocs.guard?.payloadTargets, [
        { path: 'fromPaths[*]', kind: 'path', access: 'write' },
        { path: 'toNotebook', kind: 'notebook', access: 'write' },
        { path: 'toPath', kind: 'path', access: 'write' }
    ]);
    assert.deepEqual(filetreeMoveDocsByID.guard?.payloadTargets, [
        { path: 'fromIDs[*]', kind: 'id', access: 'write' },
        { path: 'toID', kind: 'id', access: 'write' }
    ]);
    assert.deepEqual(filetreeGetIDsByHPath.guard?.payloadTargets, [
        { path: 'notebook', kind: 'notebook', access: 'read' }
    ]);
});

test('workspace, filetree, and global response guards use post-client response shapes', () => {
    assert.deepEqual(fileReadDir.guard?.payloadTargets, [
        { path: 'path', kind: 'workspace-path', access: 'read' }
    ]);
    assert.deepEqual(fileRenameFile.guard?.payloadTargets, [
        { path: 'path', kind: 'workspace-path', access: 'write' },
        { path: 'newPath', kind: 'workspace-path', access: 'write' }
    ]);
    assert.deepEqual(filetreeGetIDsByHPath.guard?.payloadTargets, [
        { path: 'notebook', kind: 'notebook', access: 'read' }
    ]);
    assert.equal(
        searchFullTextSearchBlock.guard?.response?.itemsAt,
        'blocks[*]'
    );
    assert.equal(notebookLsNotebooks.guard?.response?.itemsAt, 'notebooks[*]');
});

test('response guards are evaluated against unwrapped data', async () => {
    const engine = {
        filterItems(items: any[]) {
            return {
                kept: items.slice(0, 1),
                removed: Math.max(0, items.length - 1),
                reasons: { denied: Math.max(0, items.length - 1) }
            };
        }
    } as any;

    const searchResponse = (await applyResponseGuard(
        searchFullTextSearchBlock,
        { blocks: [{ id: 'a' }, { id: 'b' }] },
        engine
    )) as any;
    assert.deepEqual(searchResponse.blocks, [{ id: 'a' }]);

    const notebookResponse = (await applyResponseGuard(
        notebookLsNotebooks,
        { notebooks: [{ id: 'nb1' }, { id: 'nb2' }] },
        engine
    )) as any;
    assert.deepEqual(notebookResponse.notebooks, [{ id: 'nb1' }]);
});

test('moveDocs rejects when any fromPaths item is denied before request execution', async () => {
    let actualCalls = 0;
    const client = {
        call: async () => {
            actualCalls++;
            return { ok: true };
        },
        upload: async () => ({ ok: true })
    } as any;
    const { config, engine } = makeEngine(client, {
        rules: [{ action: 'write', path: '/denied/**', effect: 'deny' }]
    });
    const entry = registerOne(filetreeMoveDocs);

    await assert.rejects(
        () =>
            executeEndpoint({
                entry,
                payload: {
                    fromPaths: [
                        '/allowed/a.sy',
                        '/denied/b.sy',
                        '/allowed/c.sy'
                    ],
                    toNotebook: '20260101120000-abcdefg',
                    toPath: '/allowed/target.sy'
                },
                client,
                engine,
                config
            }),
        ContentDeniedError
    );
    assert.equal(actualCalls, 0);
});

test('declarative root-array response filtering still emits warnings', async () => {
    const engine = {
        filterItems(items: any[]) {
            return {
                kept: items.filter((x) => x.path !== '/denied/doc.sy'),
                removed: 1,
                reasons: { denied: 1 }
            };
        }
    } as any;
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: any) => {
        writes.push(String(chunk));
        return true;
    }) as any;
    try {
        const filtered = await applyResponseGuard(
            filetreeSearchDocs,
            [
                { box: 'nb', path: '/allowed/doc.sy', hPath: '/Allowed' },
                { box: 'nb', path: '/denied/doc.sy', hPath: '/Denied' }
            ],
            engine
        );
        assert.deepEqual(filtered, [
            { box: 'nb', path: '/allowed/doc.sy', hPath: '/Allowed' }
        ]);
        assert.match(writes.join(''), /CONTENT_FILTERED/);
    } finally {
        process.stderr.write = origWrite as any;
    }
});

test('runtime/meta/network severity mapping is explicit', () => {
    assert.equal(registerOne(notificationPushErrMsg).meta.severity, 'low');
    assert.equal(registerOne(networkForwardProxy).meta.severity, 'high');
    assert.equal(registerOne(sqliteFlushTransaction).meta.severity, 'high');
    assert.equal(registerOne(systemGetConf).meta.severity, 'medium');
    assert.equal(registerOne(systemLogoutAuth).meta.severity, 'medium');
    assert.equal(registerOne(systemVersion).meta.severity, 'low');
});

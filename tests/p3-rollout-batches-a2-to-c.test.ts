import test from "node:test";
import assert from "node:assert/strict";

import { EndpointRegistry } from "../src/core/registry.ts";
import { deriveEndpointId } from "../src/core/schema.ts";
import { applyResponseGuard, executeEndpoint } from "../src/core/guard.ts";
import { PermissionEngine, ContentAccessDeniedError } from "../src/core/permission.ts";
import type { AppConfig, PermissionConfig } from "../src/core/config.ts";

import { schema as assetUpload } from "../src/apis/asset/upload.ts";
import { schema as convertPandoc } from "../src/apis/convert/pandoc.ts";
import { schema as exportMdContent } from "../src/apis/export/exportMdContent.ts";
import { schema as exportResources } from "../src/apis/export/exportResources.ts";
import { schema as searchFullTextSearchBlock } from "../src/apis/search/fullTextSearchBlock.ts";
import { schema as templateRender } from "../src/apis/template/render.ts";
import { schema as templateRenderSprig } from "../src/apis/template/renderSprig.ts";

import { schema as fileReadDir } from "../src/apis/file/readDir.ts";
import { schema as fileRemoveFile } from "../src/apis/file/removeFile.ts";
import { schema as fileRenameFile } from "../src/apis/file/renameFile.ts";
import { schema as notebookCloseNotebook } from "../src/apis/notebook/closeNotebook.ts";
import { schema as notebookCreateNotebook } from "../src/apis/notebook/createNotebook.ts";
import { schema as notebookGetNotebookConf } from "../src/apis/notebook/getNotebookConf.ts";
import { schema as notebookLsNotebooks } from "../src/apis/notebook/lsNotebooks.ts";
import { schema as notebookOpenNotebook } from "../src/apis/notebook/openNotebook.ts";
import { schema as notebookRemoveNotebook } from "../src/apis/notebook/removeNotebook.ts";
import { schema as notebookRenameNotebook } from "../src/apis/notebook/renameNotebook.ts";
import { schema as notebookSetNotebookConf } from "../src/apis/notebook/setNotebookConf.ts";

import { schema as filetreeCreateDailyNote } from "../src/apis/filetree/createDailyNote.ts";
import { schema as filetreeCreateDocWithMd } from "../src/apis/filetree/createDocWithMd.ts";
import { schema as filetreeGetHPathByID } from "../src/apis/filetree/getHPathByID.ts";
import { schema as filetreeGetHPathByPath } from "../src/apis/filetree/getHPathByPath.ts";
import { schema as filetreeGetIDsByHPath } from "../src/apis/filetree/getIDsByHPath.ts";
import { schema as filetreeGetPathByID } from "../src/apis/filetree/getPathByID.ts";
import { schema as filetreeListDocsByPath } from "../src/apis/filetree/listDocsByPath.ts";
import { schema as filetreeMoveDocs } from "../src/apis/filetree/moveDocs.ts";
import { schema as filetreeMoveDocsByID } from "../src/apis/filetree/moveDocsByID.ts";
import { schema as filetreeRemoveDoc } from "../src/apis/filetree/removeDoc.ts";
import { schema as filetreeRemoveDocByID } from "../src/apis/filetree/removeDocByID.ts";
import { schema as filetreeRenameDoc } from "../src/apis/filetree/renameDoc.ts";
import { schema as filetreeRenameDocByID } from "../src/apis/filetree/renameDocByID.ts";
import { schema as filetreeSearchDocs } from "../src/apis/filetree/searchDocs.ts";

import { schema as notificationPushErrMsg } from "../src/apis/notification/pushErrMsg.ts";
import { schema as networkForwardProxy } from "../src/apis/network/forwardProxy.ts";
import { schema as sqliteFlushTransaction } from "../src/apis/sqlite/flushTransaction.ts";
import { schema as systemBootProgress } from "../src/apis/system/bootProgress.ts";
import { schema as systemCurrentTime } from "../src/apis/system/currentTime.ts";
import { schema as systemGetConf } from "../src/apis/system/getConf.ts";
import { schema as systemLogoutAuth } from "../src/apis/system/logoutAuth.ts";
import { schema as systemVersion } from "../src/apis/system/version.ts";

function makeConfig(permission?: PermissionConfig): AppConfig {
  return {
    schemaVersion: 2,
    current: "local",
    workspaces: {
      local: {
        baseUrl: "http://127.0.0.1:6806",
        ...(permission ? { permission } : {}),
      },
    },
  };
}

function registerOne(schema: any) {
  const registry = new EndpointRegistry();
  registry.register(schema);
  return registry.get(deriveEndpointId(schema.endpoint).id)!;
}

test("Batches A2-B2-C migrated compatible endpoints to authored classification", () => {
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
    systemVersion,
  ];

  for (const schema of migrated) {
    assert.ok(schema.classification, `${schema.endpoint} should define classification`);
    const entry = registerOne(schema);
    assert.equal(entry.meta.classification.mode, schema.classification!.mode);
  }
});

test("phase 6 holdouts are fully migrated with explicit array targets", () => {
  assert.deepEqual(exportResources.guard?.payloadTargets, [
    { field: "paths", kind: "workspace-path", access: "read", isArray: true },
  ]);
  assert.deepEqual(filetreeMoveDocs.guard?.payloadTargets, [
    { field: "fromPaths", kind: "path", access: "write", isArray: true },
    { field: "toNotebook", kind: "notebook", access: "write" },
    { field: "toPath", kind: "path", access: "write" },
  ]);
  assert.deepEqual(filetreeMoveDocsByID.guard?.payloadTargets, [
    { field: "fromIDs", kind: "id", access: "write", isArray: true },
    { field: "toID", kind: "id", access: "write" },
  ]);
  assert.deepEqual(filetreeGetIDsByHPath.guard?.payloadTargets, [
    { field: "notebook", kind: "notebook", access: "read" },
  ]);
});

test("workspace, filetree, and global response guards use post-client response shapes", () => {
  assert.deepEqual(fileReadDir.guard?.payloadTargets, [
    { field: "path", kind: "workspace-path", access: "read" },
  ]);
  assert.deepEqual(fileRenameFile.guard?.payloadTargets, [
    { field: "path", kind: "workspace-path", access: "write" },
    { field: "newPath", kind: "workspace-path", access: "write" },
  ]);
  assert.deepEqual(filetreeGetIDsByHPath.guard?.payloadTargets, [
    { field: "notebook", kind: "notebook", access: "read" },
  ]);
  assert.equal(searchFullTextSearchBlock.guard?.response?.itemsAt, "blocks[*]");
  assert.equal(notebookLsNotebooks.guard?.response?.itemsAt, "notebooks[*]");
});

test("response guards are evaluated against unwrapped data", () => {
  const engine = {
    filterItems(items: any[]) {
      return { kept: items.slice(0, 1), removed: Math.max(0, items.length - 1), reasons: { denied: Math.max(0, items.length - 1) } };
    },
  } as any;

  const searchResponse = applyResponseGuard(
    searchFullTextSearchBlock,
    { blocks: [{ id: "a" }, { id: "b" }] },
    engine,
  ) as any;
  assert.deepEqual(searchResponse.blocks, [{ id: "a" }]);

  const notebookResponse = applyResponseGuard(
    notebookLsNotebooks,
    { notebooks: [{ id: "nb1" }, { id: "nb2" }] },
    engine,
  ) as any;
  assert.deepEqual(notebookResponse.notebooks, [{ id: "nb1" }]);
});

test("moveDocs rejects when any fromPaths item is denied before request execution", async () => {
  let actualCalls = 0;
  const client = {
    call: async () => {
      actualCalls++;
      return { ok: true };
    },
    upload: async () => ({ ok: true }),
  } as any;
  const engine = new PermissionEngine(makeConfig({ content: { write: { paths: { deny: ["/denied/**"] } } } }), "local", client);
  const entry = registerOne(filetreeMoveDocs);

  await assert.rejects(
    () => executeEndpoint({
      entry,
      payload: {
        fromPaths: ["/allowed/a.sy", "/denied/b.sy", "/allowed/c.sy"],
        toNotebook: "20260101120000-abcdefg",
        toPath: "/allowed/target.sy",
      },
      client,
      engine,
    }),
    ContentAccessDeniedError,
  );
  assert.equal(actualCalls, 0);
});

test("searchDocs filters denied rows from unwrapped array responses", () => {
  const engine = {
    filterItems(items: any[]) {
      return { kept: items.filter((x) => x.path !== "/denied/doc.sy"), removed: 1, reasons: { denied: 1 } };
    },
  } as any;

  const filtered = filetreeSearchDocs.guard!.filterResponse!([
    { box: "nb", path: "/allowed/doc.sy", hPath: "/Allowed" },
    { box: "nb", path: "/denied/doc.sy", hPath: "/Denied" },
  ], engine);
  assert.deepEqual(filtered, [{ box: "nb", path: "/allowed/doc.sy", hPath: "/Allowed" }]);
});

test("runtime/meta/network risk mapping is explicit", () => {
  assert.equal(registerOne(notificationPushErrMsg).meta.risk, "safe");
  assert.equal(registerOne(networkForwardProxy).meta.risk, "critical");
  assert.equal(registerOne(sqliteFlushTransaction).meta.risk, "destructive");
  assert.equal(registerOne(systemGetConf).meta.risk, "sensitive");
  assert.equal(registerOne(systemLogoutAuth).meta.risk, "sensitive");
  assert.equal(registerOne(systemVersion).meta.risk, "safe");
});

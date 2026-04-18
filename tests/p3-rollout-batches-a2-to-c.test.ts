import test from "node:test";
import assert from "node:assert/strict";

import { EndpointRegistry } from "../src/core/registry.ts";
import { deriveEndpointId } from "../src/core/schema.ts";
import { applyResponseGuard } from "../src/core/guard.ts";

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
    filetreeGetPathByID,
    filetreeListDocsByPath,
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
    assert.equal(schema.tags, undefined, `${schema.endpoint} should not keep legacy tags`);
    const entry = registerOne(schema);
    assert.equal(entry.meta.classification.mode, schema.classification!.mode);
  }
});

test("known array contract-gated holdouts remain legacy", () => {
  for (const schema of [exportResources, filetreeGetIDsByHPath, filetreeMoveDocs, filetreeMoveDocsByID]) {
    assert.equal(schema.classification, undefined, `${schema.endpoint} should stay blocked until array contract amendment`);
    assert.ok(schema.tags?.length, `${schema.endpoint} should still carry legacy tags during transition`);
  }
});

test("workspace and global response guards use post-client response shapes", () => {
  assert.deepEqual(fileReadDir.guard?.payloadTargets, [
    { field: "path", kind: "workspace-path", access: "read" },
  ]);
  assert.deepEqual(fileRenameFile.guard?.payloadTargets, [
    { field: "path", kind: "workspace-path", access: "write" },
    { field: "newPath", kind: "workspace-path", access: "write" },
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

test("runtime/meta/network risk mapping is explicit", () => {
  assert.equal(registerOne(notificationPushErrMsg).meta.risk, "safe");
  assert.equal(registerOne(networkForwardProxy).meta.risk, "critical");
  assert.equal(registerOne(sqliteFlushTransaction).meta.risk, "destructive");
  assert.equal(registerOne(systemGetConf).meta.risk, "sensitive");
  assert.equal(registerOne(systemVersion).meta.risk, "safe");
});

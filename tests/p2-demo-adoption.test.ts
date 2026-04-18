import test from "node:test";
import assert from "node:assert/strict";

import { EndpointRegistry } from "../src/core/registry.ts";
import { deriveEndpointId } from "../src/core/schema.ts";
import { PermissionEngine, ContentAccessDeniedError, WorkspaceAccessDeniedError } from "../src/core/permission.ts";
import { executeEndpoint } from "../src/core/guard.ts";
import type { AppConfig, PermissionConfig } from "../src/core/config.ts";
import { schema as moveBlock } from "../src/apis/block/moveBlock.ts";
import { schema as getBlockKramdown } from "../src/apis/block/getBlockKramdown.ts";
import { schema as querySql } from "../src/apis/query/sql.ts";
import { schema as fileGetFile } from "../src/apis/file/getFile.ts";
import { schema as filePutFile } from "../src/apis/file/putFile.ts";
import { schema as systemExit } from "../src/apis/system/exit.ts";
import { schema as notificationPushMsg } from "../src/apis/notification/pushMsg.ts";

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
  const { id } = deriveEndpointId(schema.endpoint);
  return registry.get(id)!;
}

test("moveBlock is normalized as content write move with three write targets", () => {
  const entry = registerOne(moveBlock);
  assert.deepEqual(entry.meta.classification, {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "move",
  });
  assert.equal(entry.meta.risk, "elevated");
  assert.deepEqual(moveBlock.guard?.payloadTargets, [
    { path: "id", kind: "id", access: "write" },
    { path: "parentID", kind: "id", access: "write" },
    { path: "previousID", kind: "id", access: "write" },
  ]);
});

test("getBlockKramdown is normalized as content read inspect with read target", () => {
  const entry = registerOne(getBlockKramdown);
  assert.deepEqual(entry.meta.classification, {
    mode: "read",
    surface: "content",
    scope: "single",
    operation: "inspect",
  });
  assert.equal(entry.meta.risk, "sensitive");
  assert.deepEqual(getBlockKramdown.guard?.payloadTargets, [
    { path: "id", kind: "id", access: "read" },
  ]);
});

test("query.sql remains global read query with declarative root-array response guard", () => {
  const entry = registerOne(querySql);
  assert.deepEqual(entry.meta.classification, {
    mode: "read",
    surface: "content",
    scope: "global",
    operation: "query",
  });
  assert.equal(entry.meta.risk, "sensitive");
  assert.deepEqual(querySql.guard?.response, {
    itemsAt: "[*]",
    fieldMap: { id: "id", path: "path", notebook: "box" },
  });
});

test("file.getFile and file.putFile use workspace-path targets", () => {
  const readEntry = registerOne(fileGetFile);
  const writeEntry = registerOne(filePutFile);

  assert.equal(readEntry.meta.classification.surface, "workspace");
  assert.equal(readEntry.meta.classification.mode, "read");
  assert.deepEqual(fileGetFile.guard?.payloadTargets, [
    { path: "path", kind: "workspace-path", access: "read" },
  ]);

  assert.equal(writeEntry.meta.classification.surface, "workspace");
  assert.equal(writeEntry.meta.classification.mode, "write");
  assert.equal(writeEntry.meta.risk, "critical");
  assert.deepEqual(filePutFile.guard?.payloadTargets, [
    { path: "path", kind: "workspace-path", access: "write" },
  ]);
});

test("system.exit and pushMsg demonstrate runtime riskOverride extremes", () => {
  const exitEntry = registerOne(systemExit);
  const msgEntry = registerOne(notificationPushMsg);

  assert.equal(exitEntry.meta.classification.mode, "invoke");
  assert.equal(exitEntry.meta.classification.surface, "runtime");
  assert.equal(exitEntry.meta.risk, "critical");
  assert.equal(exitEntry.meta.requiresConfirmation, true);

  assert.equal(msgEntry.meta.classification.mode, "invoke");
  assert.equal(msgEntry.meta.classification.surface, "runtime");
  assert.equal(msgEntry.meta.risk, "safe");
  assert.equal(msgEntry.meta.requiresConfirmation, false);
});

test("moveBlock denies when parentID resolves into denied content.write path", async () => {
  let actualCalls = 0;
  const client = {
    call: async (endpoint: string, payload: { stmt?: string }) => {
      if (endpoint === "/api/query/sql") {
        return [
          { id: "blk-ok", box: "nb", path: "/allowed/doc.sy" },
          { id: "parent-denied", box: "nb", path: "/denied/doc.sy" },
          { id: "prev-ok", box: "nb", path: "/allowed/doc.sy" },
        ];
      }
      actualCalls++;
      return { ok: true };
    },
    upload: async () => ({ ok: true }),
  } as any;
  const engine = new PermissionEngine(makeConfig({ content: { write: { paths: { deny: ["/denied/**"] } } } }), "local", client);
  const entry = registerOne(moveBlock);

  await assert.rejects(
    () => executeEndpoint({
      entry,
      payload: { id: "blk-ok", parentID: "parent-denied", previousID: "prev-ok" },
      client,
      engine,
    }),
    ContentAccessDeniedError,
  );
  assert.equal(actualCalls, 0);
});

test("getBlockKramdown denies when resolved id hits content.read deny", async () => {
  let actualCalls = 0;
  const client = {
    call: async (endpoint: string) => {
      if (endpoint === "/api/query/sql") {
        return [{ id: "blk-1", box: "nb", path: "/denied/read.sy" }];
      }
      actualCalls++;
      return { kramdown: "content" };
    },
    upload: async () => ({ ok: true }),
  } as any;
  const engine = new PermissionEngine(makeConfig({ content: { read: { paths: { deny: ["/denied/**"] } } } }), "local", client);
  const entry = registerOne(getBlockKramdown);

  await assert.rejects(
    () => executeEndpoint({ entry, payload: { id: "blk-1" }, client, engine }),
    ContentAccessDeniedError,
  );
  assert.equal(actualCalls, 0);
});

test("query.sql filters denied rows from response", async () => {
  const client = {
    call: async (endpoint: string) => {
      assert.equal(endpoint, "/api/query/sql");
      return [
        { id: "a", box: "nb", path: "/allowed/a.sy" },
        { id: "b", box: "nb", path: "/denied/b.sy" },
      ];
    },
    upload: async () => ({ ok: true }),
  } as any;
  const engine = new PermissionEngine(makeConfig({ content: { read: { paths: { deny: ["/denied/**"] } } } }), "local", client);
  const entry = registerOne(querySql);

  const result = await executeEndpoint({ entry, payload: { stmt: "SELECT * FROM blocks" }, client, engine }) as any[];
  assert.deepEqual(result, [{ id: "a", box: "nb", path: "/allowed/a.sy" }]);
});

test("file.getFile uses workspace.read and ignores content deny", async () => {
  let actualCalls = 0;
  const client = {
    call: async () => {
      actualCalls++;
      return "content";
    },
    upload: async () => ({ ok: true }),
  } as any;
  const entry = registerOne(fileGetFile);

  const denyEngine = new PermissionEngine(makeConfig({ workspace: { read: { paths: { deny: ["**"] } } } }), "local", client);
  await assert.rejects(
    () => executeEndpoint({ entry, payload: { path: "/workspace/a.txt" }, client, engine: denyEngine }),
    WorkspaceAccessDeniedError,
  );
  assert.equal(actualCalls, 0);

  const allowEngine = new PermissionEngine(makeConfig({ content: { read: { paths: { deny: ["**"] } } } }), "local", client);
  const res = await executeEndpoint({ entry, payload: { path: "/workspace/a.txt" }, client, engine: allowEngine });
  assert.equal(res, "content");
  assert.equal(actualCalls, 1);
});

test("file.putFile uses workspace.write and dry-run runs guard before preview", async () => {
  let uploadCalls = 0;
  const client = {
    call: async () => [],
    upload: async () => {
      uploadCalls++;
      return { ok: true };
    },
  } as any;
  const entry = registerOne(filePutFile);

  const denyEngine = new PermissionEngine(makeConfig({ workspace: { write: { paths: { deny: ["/blocked/**"] } } } }), "local", client);
  await assert.rejects(
    () => executeEndpoint({
      entry,
      payload: { path: "/blocked/file.txt", file: "abc" },
      client,
      engine: denyEngine,
      dryRun: true,
    }),
    WorkspaceAccessDeniedError,
  );

  const allowEngine = new PermissionEngine(makeConfig({ content: { write: { paths: { deny: ["**"] } } } }), "local", client);
  const preview = await executeEndpoint({
    entry,
    payload: { path: "/allowed/file.txt", file: "abc" },
    client,
    engine: allowEngine,
    dryRun: true,
  }) as any;
  assert.deepEqual(preview, {
    dryRun: true,
    endpoint: "/api/file/putFile",
    payload: { path: "/allowed/file.txt", file: "abc" },
  });
  assert.equal(uploadCalls, 0);
});

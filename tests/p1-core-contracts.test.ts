import test from "node:test";
import assert from "node:assert/strict";

import { EndpointRegistry } from "../src/core/registry.ts";
import { PermissionEngine, BlockNotFoundError, WorkspaceAccessDeniedError } from "../src/core/permission.ts";
import { applyPayloadGuard } from "../src/core/guard.ts";
import type { AppConfig, PermissionConfig } from "../src/core/config.ts";
import type { EndpointSchema, PermissionEngineLike } from "../src/core/schema.ts";

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

test("registry derives meta from authored classification", () => {
  const registry = new EndpointRegistry();
  const schema: EndpointSchema = {
    endpoint: "/api/query/sql",
    summary: "SQL",
    payload: { type: "object", properties: { stmt: { type: "string" } } },
    classification: { mode: "read", surface: "content", scope: "global", operation: "query" },
    guard: {
      response: { itemsAt: "blocks[*]", fieldMap: { id: "id", path: "path", notebook: "box" } },
    },
  };

  registry.register(schema);
  const entry = registry.get("query.sql")!;
  assert.equal(entry.meta.classification.mode, "read");
  assert.equal(entry.meta.classification.surface, "content");
  assert.equal(entry.meta.classification.scope, "global");
  assert.equal(entry.meta.classification.operation, "query");
  assert.equal(entry.meta.risk, "sensitive");
  assert.ok(entry.meta.tags.includes("mode:read"));
});

test("riskOverride wins over matrix", () => {
  const registry = new EndpointRegistry();
  registry.register({
    endpoint: "/api/system/exit",
    summary: "Exit",
    payload: { type: "object", properties: {} },
    classification: {
      mode: "invoke",
      surface: "runtime",
      scope: "single",
      operation: "control",
      riskOverride: "critical",
    },
  });
  const entry = registry.get("system.exit")!;
  assert.equal(entry.meta.risk, "critical");
  assert.equal(entry.meta.requiresConfirmation, true);
});

test("global read endpoint without response guard fails loud", () => {
  const registry = new EndpointRegistry();
  assert.throws(() => {
    registry.register({
      endpoint: "/api/query/sql",
      summary: "SQL",
      payload: { type: "object", properties: { stmt: { type: "string" } } },
      classification: { mode: "read", surface: "content", scope: "global", operation: "query" },
    });
  }, /global read/);
});

test("schema without classification fails loud", () => {
  const registry = new EndpointRegistry();
  assert.throws(() => {
    registry.register({
      endpoint: "/api/system/version",
      summary: "Version",
      payload: { type: "object", properties: {} },
    });
  }, /must declare classification/);
});

test("payloadTargets field must exist in payload.properties", () => {
  const registry = new EndpointRegistry();
  assert.throws(() => {
    registry.register({
      endpoint: "/api/block/updateBlock",
      summary: "Update",
      payload: { type: "object", properties: { id: { type: "string" } } },
      classification: { mode: "write", surface: "content", scope: "single", operation: "update" },
      guard: { payloadTargets: [{ field: "missing", kind: "id", access: "write" }] },
    });
  }, /payloadTargets field/);
});

test("requiresConfirmation uses risk-auto and policy-match union", () => {
  const client = { call: async () => [] } as any;
  const config = makeConfig({
    confirm: { modes: ["write"] },
  });
  const engine = new PermissionEngine(config, "local", client);

  const elevatedWrite = {
    id: "block.updateBlock",
    group: "block",
    name: "updateBlock",
    schema: {
      endpoint: "/api/block/updateBlock",
      summary: "Update",
      payload: { type: "object", properties: { id: { type: "string" } } },
      classification: { mode: "write", surface: "content", scope: "single", operation: "update" },
    },
    meta: {
      classification: { mode: "write", surface: "content", scope: "single", operation: "update" },
      risk: "elevated",
      tags: ["mode:write"],
      requiresConfirmation: false,
    },
  } as any;

  const criticalInvoke = {
    ...elevatedWrite,
    id: "system.exit",
    meta: {
      classification: { mode: "invoke", surface: "runtime", scope: "single", operation: "control", riskOverride: "critical" },
      risk: "critical",
      tags: ["risk:critical"],
      requiresConfirmation: true,
    },
  } as any;

  const sensitiveRead = {
    ...elevatedWrite,
    id: "query.sql",
    meta: {
      classification: { mode: "read", surface: "content", scope: "global", operation: "query" },
      risk: "sensitive",
      tags: ["mode:read"],
      requiresConfirmation: false,
    },
  } as any;

  assert.equal(engine.requiresConfirmation(elevatedWrite), true);
  assert.equal(engine.requiresConfirmation(criticalInvoke), true);
  assert.equal(engine.requiresConfirmation(sensitiveRead), false);
});

test("resolveContentIds caches and throws BlockNotFoundError for missing ids", async () => {
  let calls = 0;
  const client = {
    call: async (_endpoint: string, payload: { stmt: string }) => {
      calls++;
      if (payload.stmt.includes("'known'")) {
        return [{ id: "known", box: "nb", path: "/20260107143325-zbrtqup/known.sy" }];
      }
      return [];
    },
  } as any;

  const engine = new PermissionEngine(makeConfig(), "local", client);
  const one = await engine.resolveContentId("known");
  assert.deepEqual(one, { notebook: "nb", path: "/20260107143325-zbrtqup/known.sy" });
  assert.equal(calls, 1);

  await engine.resolveContentId("known");
  assert.equal(calls, 1);

  await assert.rejects(() => engine.resolveContentIds(["known", "missing"]), BlockNotFoundError);
  assert.equal(calls, 2);
});

test("workspace surface-aware heuristic treats path as workspace-path", async () => {
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
      return { notebook: "nb", path: "/x.sy" };
    },
    filterItems(items) {
      return { kept: items, removed: 0, reasons: {} };
    },
  };

  await applyPayloadGuard(
    {
      endpoint: "/api/file/putFile",
      summary: "Put",
      payload: { type: "object", properties: { path: { type: "string" } } },
      classification: { mode: "write", surface: "workspace", scope: "single", operation: "update" },
    },
    { path: "/workspace/notes.txt" },
    engine,
    "write",
    "workspace",
  );

  assert.deepEqual(seen, [{ kind: "workspace-path", value: "/workspace/notes.txt", access: "write" }]);
});

test("array payload targets reject on any denied item", async () => {
  const seen: string[] = [];
  const engine: PermissionEngineLike = {
    checkEndpoint() {},
    checkTool() {},
    async checkContentRef(ref) {
      seen.push(ref.value);
      if (ref.value === "bad") throw new Error("denied");
    },
    async resolveContentIds() {
      return new Map();
    },
    async resolveContentId() {
      return { notebook: "nb", path: "/x.sy" };
    },
    filterItems(items) {
      return { kept: items, removed: 0, reasons: {} };
    },
  };

  await assert.rejects(() => applyPayloadGuard(
    {
      endpoint: "/api/test/arrayRefs",
      summary: "Array refs",
      payload: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } } },
      classification: { mode: "write", surface: "content", scope: "batch", operation: "update" },
      guard: { payloadTargets: [{ field: "ids", kind: "id", access: "write", isArray: true }] },
    },
    { ids: ["ok", "bad", "later"] },
    engine,
    "write",
    "content",
  ));
  assert.deepEqual(seen, ["ok", "bad"]);
});

test("workspace deny rejects workspace-path refs", async () => {
  const client = { call: async () => [] } as any;
  const engine = new PermissionEngine(makeConfig({ workspace: { write: { paths: { deny: ["**"] } } } }), "local", client);
  await assert.rejects(
    () => engine.checkContentRef({ kind: "workspace-path", value: "/workspace/notes.txt", access: "write" }),
    WorkspaceAccessDeniedError,
  );
});

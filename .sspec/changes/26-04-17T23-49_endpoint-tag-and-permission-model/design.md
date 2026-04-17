---
change: "endpoint-tag-and-permission-model"
change-type: root
created: 2026-04-17T23:49:57
---

# Design: endpoint-tag-and-permission-model

## 1. Root Scope

### 1.1 What this root change coordinates

```text
P1 Core Contracts
  ├─ classification type system
  ├─ derived tags / risk / confirmation semantics
  ├─ payloadTargets + response guard contract
  ├─ bulk content id resolver
  ├─ permission config v2 (read/write split)
  ├─ endpoint/tool hard deny rules
  └─ error taxonomy

P2 Demo Adoption
  ├─ block.moveBlock    (content write + multi-id payload guard)
  ├─ query.sql          (global read + response filtering)
  └─ file.putFile       (workspace write)

P3 Rollout
  ├─ remaining src/apis/** migration
  ├─ selected src/tools/** migration
  ├─ docs/config examples refresh
  └─ expanded regression tests
```

### 1.2 What stays out of P1

```text
- payloadTargets array expansion for list-valued fields (e.g. fromPaths[*])
- ToolCapability runtime enforcement
- SQL subquery rewriting / payload-time SQL static analysis
- deprecated/minKernelVersion derived tags
- full docs sweep across all src/docs/*.md
```

这些项允许在 P2/P3 或后续 root 下继续推进。

---

## 2. Shared Contract — Classification

### 2.1 Authored fields

```ts
// src/core/schema.ts

type EndpointMode = "read" | "write" | "invoke";
type EndpointSurface = "meta" | "content" | "asset" | "workspace" | "runtime" | "network";
type EndpointScope = "single" | "batch" | "global";
type EndpointOperation =
  | "inspect"
  | "search"
  | "query"
  | "create"
  | "update"
  | "delete"
  | "move"
  | "upload"
  | "control";

type RiskLabel = "safe" | "sensitive" | "elevated" | "destructive" | "critical";

interface EndpointClassification {
  mode: EndpointMode;
  surface: EndpointSurface;
  scope: EndpointScope;
  operation?: EndpointOperation;
  riskOverride?: RiskLabel; // edge case override, e.g. pushMsg vs exit
}
```

### 2.2 Derived fields

```ts
interface DerivedMeta {
  tags: string[];
  risk: RiskLabel;
  requiresConfirmation: boolean;
}
```

### 2.2.1 Registry-facing shape

```ts
interface EndpointSchema {
  endpoint: string;
  summary: string;
  description?: string;

  payload: JSONSchema;
  response?: JSONSchemaProperty;

  // authored in each schema file
  classification: EndpointClassification;

  // orthogonal fields kept intact
  minKernelVersion?: string;
  deprecated?: { replacement?: string; removeAt?: string; reason?: string };
  multipart?: { fileFields: string[] };
  cli?: CliBehavior;
  guard?: GuardSpec;
}

interface RegisteredEndpoint {
  schema: EndpointSchema;
  id: string;      // e.g. "block.moveBlock"
  group: string;   // e.g. "block"
  name: string;    // e.g. "moveBlock"
  meta: DerivedMeta;
}
```

```text
schema author writes     -> classification
registry derives         -> meta.tags / meta.risk / meta.requiresConfirmation
CLI help/list/describe   -> consume RegisteredEndpoint.meta
```

这个契约保证 schema 文件只承载 authored truth，派生字段集中在 registry 层。 

### 2.3 Risk derivation

| mode   | surface                  | scope          | default risk |
|--------|--------------------------|----------------|--------------|
| read   | meta                     | any            | safe |
| read   | content / asset          | any            | sensitive |
| read   | workspace / network      | any            | elevated |
| write  | content / asset          | single         | elevated |
| write  | content / asset          | batch / global | destructive |
| write  | workspace                | any            | critical |
| invoke | runtime                  | any            | destructive |
| invoke | network                  | any            | critical |

**Override rule**

```text
risk = classification.riskOverride ?? deriveRisk(mode, surface, scope)
```

**典型 override：**

| Endpoint | classification | default risk | override |
|---|---|---:|---:|
| `notification.pushMsg` | `invoke/runtime/single/control` | destructive | safe |
| `notification.pushErrMsg` | `invoke/runtime/single/control` | destructive | safe |
| `system.exit` | `invoke/runtime/single/control` | destructive | critical |

### 2.4 Confirmation semantics

**安全模型假设：**

```text
deny = hard boundary
confirm = interactive guardrail
```

在 agent 场景里，confirm 常被 `--yes` 显式放行；因此所有真正危险的访问都必须由 deny 规则兜底，不能依赖 confirm。

**组合规则：**

```text
policy-match =
  mode ∈ confirm.modes
  OR surface ∈ confirm.surfaces
  OR scope ∈ confirm.scopes

risk-auto = risk ∈ {destructive, critical}

requiresConfirmation = risk-auto OR policy-match
```

- 维度内：OR
- 维度间：OR
- 与 risk 自动触发：union

---

## 3. Shared Contract — Guard

### 3.1 PayloadTargets（P1 frozen shape）

```ts
type ResourceKind =
  | "id"
  | "notebook"
  | "path"
  | "workspace-path";

interface PayloadTargetSpec {
  field: string; // P1 只支持 flat string field；数组展开留到 P3+
  kind: ResourceKind;
  access: "read" | "write";
}

interface GuardSpec {
  payloadTargets?: PayloadTargetSpec[];

  response?: {
    itemsAt: string;
    fieldMap: Partial<Record<"id" | "path" | "notebook", string>>;
  };

  filterResponse?: (response: unknown, engine: PermissionEngineLike) => unknown;
}
```

### 3.1.1 Full endpoint schema examples

```ts
// block.moveBlock
export const schema: EndpointSchema = {
  endpoint: "/api/block/moveBlock",
  summary: "Move a block",
  payload: {
    type: "object",
    required: ["id", "previousID", "parentID"],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      previousID: { type: "string" },
      parentID: { type: "string" },
    },
  },
  classification: {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "move",
  },
  guard: {
    payloadTargets: [
      { field: "id", kind: "id", access: "write" },
      { field: "parentID", kind: "id", access: "write" },
      { field: "previousID", kind: "id", access: "write" },
    ],
  },
};
```

```ts
// query.sql
export const schema: EndpointSchema = {
  endpoint: "/api/query/sql",
  summary: "Execute SQL query",
  payload: {
    type: "object",
    required: ["stmt"],
    additionalProperties: false,
    properties: {
      stmt: { type: "string" },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "global",
    operation: "query",
  },
  guard: {
    response: {
      itemsAt: "data[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
```

```ts
// file.putFile
export const schema: EndpointSchema = {
  endpoint: "/api/file/putFile",
  summary: "Put file under workspace directory",
  payload: {
    type: "object",
    required: ["path", "file"],
    additionalProperties: false,
    properties: {
      path: { type: "string" },
      file: { type: "string" },
      isDir: { type: "boolean", default: false },
      modTime: { type: "integer" },
    },
  },
  classification: {
    mode: "write",
    surface: "workspace",
    scope: "single",
    operation: "update",
  },
  guard: {
    payloadTargets: [
      { field: "path", kind: "workspace-path", access: "write" },
    ],
  },
};
```

### 3.2 Execution model

```text
payload side
  field -> kind -> resolve(if id) -> policy check

response side
  itemsAt -> fieldMap -> filterItems() -> write filtered items back
```

### 3.3 Static guard rule for global read endpoints

```text
IF classification.mode == "read"
AND classification.scope == "global"
THEN schema.guard.response OR schema.guard.filterResponse MUST exist
```

目的：避免新增 `query.sql` 风格 endpoint 时忘记加 response filter。

### 3.4 Demo mappings

```ts
// block.moveBlock
classification: { mode: "write", surface: "content", scope: "single", operation: "move" }
guard: {
  payloadTargets: [
    { field: "id",         kind: "id", access: "write" },
    { field: "parentID",   kind: "id", access: "write" },
    { field: "previousID", kind: "id", access: "write" },
  ]
}
```

```ts
// query.sql
classification: { mode: "read", surface: "content", scope: "global", operation: "query" }
guard: {
  response: {
    itemsAt: "data[*]",
    fieldMap: { id: "id", path: "path", notebook: "box" },
  }
}
```

```ts
// file.putFile
classification: { mode: "write", surface: "workspace", scope: "single", operation: "update" }
guard: {
  payloadTargets: [
    { field: "path", kind: "workspace-path", access: "write" },
  ]
}
```

---

## 4. Shared Contract — ID Resolver

### 4.1 Batch-first interface

```ts
interface PermissionEngineLike {
  checkEndpoint(id: string): void;
  checkTool(id: string): void;

  resolveContentIds(ids: string[]): Promise<Map<string, { notebook: string; path: string }>>;
  resolveContentId(id: string): Promise<{ notebook: string; path: string }>;

  checkContentRef(ref: { kind: ResourceKind; value: string; access: "read" | "write" }): Promise<void>;
  filterItems<T>(
    items: T[],
    extract: (item: T) => { id?: string; path?: string; notebook?: string },
  ): { kept: T[]; removed: number; reasons: Record<string, number> };
}
```

### 4.2 Resolution algorithm

```text
resolveContentIds(ids)
  ├─ dedupe ids
  ├─ hit in-memory cache first
  ├─ missing ids -> one SQL query
  │     SELECT id, box, path FROM blocks WHERE id IN (...)
  ├─ cache results
  └─ if any requested id missing -> throw BlockNotFoundError(missingIds)
```

### 4.3 Error taxonomy

```ts
class BlockNotFoundError extends CliError {
  // errorType: BLOCK_NOT_FOUND
  // exit: GENERAL
}

class ContentAccessDeniedError extends CliError {
  // errorType: CONTENT_ACCESS_DENIED
  // exit: PERMISSION
}

class WorkspaceAccessDeniedError extends CliError {
  // errorType: WORKSPACE_ACCESS_DENIED
  // exit: PERMISSION
}

class EndpointDisabledError extends CliError {
  // errorType: ENDPOINT_DISABLED
  // exit: PERMISSION
}

class ToolDisabledError extends CliError {
  // errorType: TOOL_DISABLED
  // exit: PERMISSION
}
```

`not found` 与 `permission denied` 必须区分，避免 agent 误判原因。
`EndpointDisabledError` / `ToolDisabledError` 属于策略层错误，放在同一 taxonomy 中统一定义，但不属于 resolver 专属错误。

---

## 5. Shared Contract — Permission Config v2

### 5.1 Shape

```ts
interface ContentScopeRule {
  notebooks?: { allow?: string[]; deny?: string[] };
  paths?: { allow?: string[]; deny?: string[] };
}

interface WorkspaceScopeRule {
  paths?: { allow?: string[]; deny?: string[] };
}

interface ConfirmPolicy {
  modes?: EndpointMode[];
  surfaces?: EndpointSurface[];
  scopes?: EndpointScope[];
}

interface PermissionConfigV2 {
  endpoints?: { allow?: string[]; deny?: string[] };
  tools?: { allow?: string[]; deny?: string[] };

  content?: {
    read?: ContentScopeRule;
    write?: ContentScopeRule;
  };

  workspace?: {
    read?: WorkspaceScopeRule;
    write?: WorkspaceScopeRule;
  };

  confirm?: ConfirmPolicy;
}
```

### 5.1.1 Full config file shape

```ts
interface TokenSource {
  type: "env" | "file" | "command";
  value: string;
}

interface WorkspaceEntry {
  baseUrl: string;
  token?: string;
  tokenSource?: TokenSource;
  permission?: PermissionConfigV2;
}

interface AppConfigV2 {
  schemaVersion: 2;
  current: string;
  workspaces: Record<string, WorkspaceEntry>;
  defaults?: {
    permission?: PermissionConfigV2;
  };
}
```

### 5.1.2 YAML demo

```yaml
schemaVersion: 2
current: local

defaults:
  permission:
    confirm:
      modes: ["write", "invoke"]
      surfaces: ["workspace", "runtime", "network"]
      scopes: ["batch", "global"]

workspaces:
  local:
    baseUrl: http://127.0.0.1:6806
    tokenSource:
      type: env
      value: SIYUAN_TOKEN
    permission:
      endpoints:
        deny: ["system.exit", "network.*"]

      tools:
        allow: ["append-content", "list-doc-tree"]

      content:
        read:
          notebooks:
            allow: ["20240101000000-abcdefg"]
          paths:
            deny: ["/系统/**"]
        write:
          notebooks:
            allow: ["20240101000000-abcdefg"]
          paths:
            deny: ["/系统/**", "/模板/**"]

      workspace:
        read:
          paths:
            deny: ["**"]
        write:
          paths:
            deny: ["**"]
```

### 5.1.3 Config semantics examples

```text
content.read.paths.deny    -> hide matching SiYuan docs/blocks from read results
content.write.paths.deny   -> reject writes targeting matching SiYuan docs/blocks
workspace.read.paths.deny  -> reject file.getFile / file.readDir on matching paths
workspace.write.paths.deny -> reject file.putFile / file.removeFile / file.renameFile on matching paths
```

```text
read and write scopes are independent
read operation   -> check content.read / workspace.read only
write operation  -> check content.write / workspace.write only
```

`content.read.*` 不隐式推出 `content.write.*`，反之亦然。`workspace` 规则同理。`可写不可读` 与 `可读不可写` 都是合法配置。

### 5.2 Alpha migration rule

```text
schemaVersion bump allowed
old config compatibility layer omitted
behavior: remove old config and re-create
```

因为当前处于 alpha，旧配置文件无迁移价值。P1 可直接破坏式更新 config 结构。

---

## 6. Shared Contract — Tool Policy

P1 只引入最小必要复杂度：

```text
tools.allow/deny        -> hard boundary
ctx.callEndpoint(...)   -> inherits full endpoint guard chain
endpoint deny           -> wins over tool allow
```

不在 P1 引入 ToolCapability enforcement。若后续需要 capability，可作为声明模型另开 sub-change。

### 6.1 Tool schema in P1

```ts
interface ToolSchema {
  id: string;
  summary: string;
  description?: string;
  tags?: string[];
  input: JSONSchema;
  output?: JSONSchemaProperty;
  cli?: CliBehavior;
  run: (ctx: ToolContext, input: unknown) => Promise<ToolResult>;
}
```

```text
P1 keeps ToolSchema shape stable.
P1 adds tool-level allow/deny policy only.
Runtime authorization still flows through ctx.callEndpoint(...).
```

---

## 7. Demo Coverage Rationale

| Demo endpoint | Why it matters | Validates |
|---|---|---|
| `block.moveBlock` | 当前多 id 覆盖 bug 最直接样本 | payloadTargets 多字段逐条检查 + batch resolver helper |
| `query.sql` | global read 无法做 payload 授权 | response guard 是唯一硬路径 |
| `file.putFile` | 最危险的 workspace 写入口 | `workspace.write.paths` 与 `workspace-path` 区分 |

这三个 demo 覆盖了最核心、最容易出安全事故的三条链路。P2 验收通过后，P3 再做全量迁移。

---

## 8. Validation Matrix

### P1 Core Contracts

| Case | Expected |
|---|---|
| risk derivation + override | `pushMsg -> safe`, `system.exit -> critical` |
| confirm semantics | OR/OR + union 按设计生效 |
| bulk resolver cache hit/miss | missing ids 统一报 `BLOCK_NOT_FOUND` |
| content read/write split | 同一路径可 read allow + write deny |
| workspace path policy | `file.putFile` 命中 `workspace.write.paths` |
| tool deny | disabled tool 立即失败 |
| global endpoint static rule | `scope=global` 且无 response guard 时注册失败 |

### P2 Demo Adoption

| Case | Expected |
|---|---|
| `moveBlock` 三个 id 任一落入 deny path | 拒绝执行 |
| `query.sql` 返回含禁区 rows | rows 被过滤，stderr 给出过滤提示 |
| `file.putFile` path 命中 deny | 抛 `WORKSPACE_ACCESS_DENIED` |
| `file.putFile --dry-run` | preview 正常，但 guard 仍先执行 |

### P3 Rollout

| Case | Expected |
|---|---|
| selected content APIs migrated | classification + payloadTargets 正确 |
| selected workspace APIs migrated | 使用 `workspace-path` |
| README / config examples updated | 示例配置与 v2 一致 |

---

## 9. Sub-change Shape Guidance

### P1 Core Contracts

**Files likely touched**
```text
src/core/schema.ts
src/core/config.ts
src/core/permission.ts
src/core/guard.ts
src/core/registry.ts
src/commands/api.ts
src/core/tools.ts
src/commands/tool.ts
README.md
```

### P2 Demo Adoption

**Files likely touched**
```text
src/apis/block/moveBlock.ts
src/apis/query/sql.ts
src/apis/file/putFile.ts
(+ any directly required support files)
```

### P3 Rollout

**Files likely touched**
```text
src/apis/**   (remaining endpoints, staged by group)
src/tools/**  (selected tools)
README.md / docs / tests
```

---

## 10. Non-goals for This Root

```text
- one-shot migration of all 60+ endpoint schema files in the first implementation pass
- config backward compatibility shims for pre-alpha users
- SQL AST/static analysis for stmt payloads
- capability-based sandboxing for tool internals
```

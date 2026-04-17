---
change: "p1-core-contracts"
created: 2026-04-18T01:28:56
---

# Design: p1-core-contracts

## 1. P1 Outcome Contract

P1 完成后，代码库满足以下条件：

```text
- core types define the new contract
- registry can normalize both new-style and legacy endpoint schemas
- permission/guard pipeline uses async content-id resolution
- config loader understands v2 only
- CLI/runtime consumes normalized endpoint meta, not raw tags
- demo endpoints are NOT required to migrate yet
```

这意味着 P2 可以只关心 `moveBlock / query.sql / file.putFile` 的 schema 迁移，而不用重新设计 core contract。

---

## 2. Interface Contract

### 2.1 Core schema types

```ts
// src/core/schema.ts

type EndpointMode = "read" | "write" | "invoke";
type EndpointSurface = "meta" | "content" | "asset" | "workspace" | "runtime" | "network";
type EndpointScope = "single" | "batch" | "global";
type EndpointOperation =
  | "inspect" | "search" | "query" | "create" | "update"
  | "delete" | "move" | "upload" | "control";

type RiskLabel = "safe" | "sensitive" | "elevated" | "destructive" | "critical";

type ResourceKind = "id" | "notebook" | "path" | "workspace-path";

interface EndpointClassification {
  mode: EndpointMode;
  surface: EndpointSurface;
  scope: EndpointScope;
  operation?: EndpointOperation;
  riskOverride?: RiskLabel;
}

interface PayloadTargetSpec {
  field: string;
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

interface EndpointSchema {
  endpoint: string;
  summary: string;
  description?: string;
  payload: JSONSchema;
  response?: JSONSchemaProperty;

  // new authored truth
  classification?: EndpointClassification;

  // transitional bridge for P1/P2/P3
  tags?: string[];

  minKernelVersion?: string;
  deprecated?: { replacement?: string; removeAt?: string; reason?: string };
  multipart?: { fileFields: string[] };
  cli?: CliBehavior;
  guard?: GuardSpec;
}

interface DerivedMeta {
  tags: string[];
  risk: RiskLabel;
  requiresConfirmation: boolean;
  classification: EndpointClassification;
}

interface RegisteredEndpoint {
  schema: EndpointSchema;
  id: string;
  group: string;
  name: string;
  meta: DerivedMeta;
}
```

### 2.2 Config v2 types

```ts
// src/core/config.ts

interface ContentScopeRule {
  notebooks?: { allow?: string[]; deny?: string[] };
  paths?: { allow?: string[]; deny?: string[] }; // SiYuan `path` (ID-based), not `hpath`
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

interface AppConfigV2 {
  schemaVersion: 2;
  current: string;
  workspaces: Record<string, WorkspaceEntry>;
  defaults?: { permission?: PermissionConfigV2 };
}
```

### 2.3 Permission engine contract

```ts
// src/core/permission.ts

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

  requiresConfirmation(entry: RegisteredEndpoint): boolean;
}
```

---

## 3. Transitional Registry Bridge

### 3.1 Why P1 needs a bridge

当前 `src/apis/**` 绝大多数 endpoint 仍是 legacy `tags` schema。  
如果 P1 强制所有 endpoint 立刻迁到 `classification`，P1 就会退化成 rollout change。

所以 P1 的 registry 需要提供一个归一化桥：

```text
new schema (classification) -> normalize -> RegisteredEndpoint.meta
legacy schema (tags)        -> normalize -> RegisteredEndpoint.meta
```

### 3.2 Bridge behavior

```ts
function normalizeEndpointSchema(schema: EndpointSchema): DerivedMeta {
  if (schema.classification) {
    return deriveFromClassification(schema.classification);
  }
  if (schema.tags?.length) {
    return deriveFromLegacyTags(schema.tags, schema.endpoint);
  }
  throw new Error("EndpointSchema requires classification or legacy tags during transition");
}
```

### 3.3 Constraints

```text
- new code should author classification
- legacy tags remain accepted only during transition
- runtime consumers must read RegisteredEndpoint.meta, never raw schema.tags
- P3 rollout removes deriveFromLegacyTags()
```

### 3.4 Legacy mapping rule (P1 only)

| Legacy tags | Normalized classification |
|---|---|
| `read` | `mode=read` |
| `write` / `mutation` / `upload` | `mode=write` |
| `dangerous` alone does not define mode | infer from siblings or endpoint group fallback |
| endpoint group `file.*` | `surface=workspace` |
| endpoint group `network.*` | `surface=network` |
| endpoint group `system.*` with runtime action | `surface=runtime` |
| fallback read groups (`query/search/block-get/...`) | `surface=content` |
| missing precision | acceptable only in transition; explicit migration in P2/P3 replaces it |

P1 不追求 legacy 映射完美，只要求 runtime contract 一致且可持续推进。

---

## 4. Registry Behavior

### 4.1 Registration flow

```text
schema file
  -> deriveEndpointId(endpoint)
  -> normalizeEndpointSchema(schema)
  -> validateGlobalReadGuard(meta.classification, schema.guard)
  -> register RegisteredEndpoint { schema, id, group, name, meta }
```

### 4.2 Static rule for global read endpoints

```text
IF meta.classification.mode == read
AND meta.classification.scope == global
THEN schema.guard.response OR schema.guard.filterResponse MUST exist
```

### 4.3 Derived meta rules

```text
risk = classification.riskOverride ?? deriveRisk(mode, surface, scope)
requiresConfirmation = risk-auto OR policy-match
meta.tags = namespaced tags derived from classification + risk
```

Example:

```ts
meta.tags = [
  "mode:write",
  "surface:content",
  "scope:single",
  "operation:move",
  "risk:elevated",
]
```

---

## 5. Permission + Guard Pipeline

### 5.1 Runtime flow

```text
executeEndpoint(entry, payload)
  │
  ├─ engine.checkEndpoint(entry.id)
  ├─ applyPayloadGuard(entry.schema.guard?.payloadTargets, payload, engine)
  ├─ debug / dry-run
  ├─ engine.requiresConfirmation(entry) && !yes -> error
  ├─ send request
  └─ applyResponseGuard(entry.schema.guard, response, engine)
```

### 5.2 Payload guard algorithm

```text
for target in payloadTargets:
  read payload[target.field]
  if missing -> continue
  if target.kind == id:
      resolveContentIds([...])
      check content.<access> with resolved notebook/path
  if target.kind == notebook:
      check content.<access>.notebooks
  if target.kind == path:
      check content.<access>.paths
  if target.kind == workspace-path:
      check workspace.<access>.paths
```

### 5.3 Read/write independence

```text
read  operation -> only check content.read / workspace.read
write operation -> only check content.write / workspace.write
```

No implicit implication in either direction.

### 5.4 Tool precedence

```text
tool allow          -> permits entering tool runtime
endpoint deny       -> still blocks actual endpoint call
```

Hard deny stays authoritative at the endpoint layer.

---

## 6. Error Taxonomy

```ts
class BlockNotFoundError extends CliError {}
class ContentAccessDeniedError extends CliError {}
class WorkspaceAccessDeniedError extends CliError {}
class EndpointDisabledError extends CliError {}
class ToolDisabledError extends CliError {}
class ConfirmationRequiredError extends CliError {}
```

Rules:

```text
- missing block id -> BlockNotFoundError
- content policy deny -> ContentAccessDeniedError
- workspace path deny -> WorkspaceAccessDeniedError
- endpoint/tools allow-deny miss -> EndpointDisabledError / ToolDisabledError
- confirmation gate hit -> ConfirmationRequiredError
```

---

## 7. Config v2 Loading Rule

### 7.1 Alpha decision

```text
schemaVersion = 2
no backward-compat shim
invalid/old config -> user recreates config
```

### 7.2 YAML demo

`content.read.paths` / `content.write.paths` always match against SiYuan `path` (ID-based path of the containing document). They do not match human-readable `hpath`.

```yaml
schemaVersion: 2
current: local

# NOTE: content.paths uses SiYuan `path` (ID-based document path), not `hpath`
# Example path: /20260107143325-zbrtqup/20260107143334-l5eqs5i.sy

defaults:
  permission:
    confirm:
      modes: ["write", "invoke"]
      surfaces: ["workspace", "runtime", "network"]
      scopes: ["batch", "global"]

workspaces:
  local:
    baseUrl: http://127.0.0.1:6806
    permission:
      endpoints:
        deny: ["system.exit", "network.*"]
      tools:
        allow: ["append-content", "list-doc-tree"]
      content:
        read:
          paths:
            deny: ["/20260101215354-j0c5gvk/**"]
        write:
          paths:
            deny: ["/20260101215354-j0c5gvk/**", "/20260109999999-abcd123/**"]
      workspace:
        write:
          paths:
            deny: ["**"]
```

---

## 8. P1 Acceptance Preview

| Area | Must hold after P1 |
|---|---|
| registry | can register legacy + new schema and expose consistent `meta` |
| config | only v2 shape is loaded |
| permission | bulk resolver + separated read/write checks work |
| guard | async payload pipeline works with `payloadTargets[]` |
| CLI | list/describe/write detection read normalized meta |
| tool runtime | tool allow/deny checked before endpoint execution |
| docs | README documents config v2 and deny/confirm model |

---

## 9. Non-goals in P1

```text
- migrate block.moveBlock/query.sql/file.putFile yet
- remove legacy tags from every endpoint schema
- add array payload target syntax
- implement capability-based tool sandboxing
```

---
change: "endpoint-tag-and-permission-model"
created: 2026-04-17T23:49:57
---

# Design: endpoint-tag-and-permission-model

## 1. Type System

### 1.1 EndpointClassification（新增，替代手写 tags）

```ts
// src/core/schema.ts

type EndpointMode      = "read" | "write" | "invoke";
// read   — 只读取，不修改持久状态
// write  — 修改 SiYuan 内容模型（block / doc / notebook / asset）或工作空间文件
// invoke — 触发运行时动作（exit / flush / forwardProxy / pushMsg 等），不直接写内容

type EndpointSurface   = "meta" | "content" | "asset" | "workspace" | "runtime" | "network";
// meta      — 系统元信息（version / bootProgress / currentTime）
// content   — SiYuan 内容模型（block / doc / notebook / attr / search / sql）
// asset     — 附件资源（upload）
// workspace — 工作空间原始文件（/api/file/*）
// runtime   — 内核运行状态（exit / flushTransaction / logoutAuth / notification）
// network   — 对外网络代理（forwardProxy）

type EndpointScope     = "single" | "batch" | "global";
// single — 作用于一个已知目标（指定 id / path）
// batch  — 作用于多个目标或集合（moveDocs / removeDoc with glob）
// global — 作用范围无法预先确定（query.sql / fullTextSearchBlock / lsNotebooks）

type EndpointOperation =
  | "inspect"  // 读单个对象元数据
  | "search"   // 全文搜索
  | "query"    // SQL 查询
  | "create"   // 新建
  | "update"   // 修改内容
  | "delete"   // 删除
  | "move"     // 移动/重命名
  | "upload"   // 上传资源
  | "control"; // 运行时控制（exit / flush / notify）

interface EndpointClassification {
  mode:       EndpointMode;
  surface:    EndpointSurface;
  scope:      EndpointScope;
  operation?: EndpointOperation; // 选填，用于需要更细语义区分的场景
}
```

### 1.2 派生 meta（registry 自动计算）

```ts
// src/core/registry.ts — 注册时调用

interface DerivedMeta {
  tags:                 string[];   // ["mode:write", "surface:content", "scope:single", "operation:delete"]
  risk:                 RiskLabel;  // "safe" | "sensitive" | "elevated" | "destructive" | "critical"
  requiresConfirmation: boolean;    // derived from risk + confirm policy
}

type RiskLabel = "safe" | "sensitive" | "elevated" | "destructive" | "critical";
```

**Risk 派生矩阵：**

| mode   | surface                  | scope          | risk        |
|--------|--------------------------|----------------|-------------|
| read   | meta                     | any            | safe        |
| read   | content / asset          | any            | sensitive   |
| read   | workspace / network      | any            | elevated    |
| write  | content / asset          | single         | elevated    |
| write  | content / asset          | batch / global | destructive |
| write  | workspace                | any            | critical    |
| invoke | runtime                  | any            | destructive |
| invoke | network                  | any            | critical    |

**默认 requiresConfirmation 规则（可被 config.confirm 覆盖）：**

```
risk in [destructive, critical]  →  requiresConfirmation = true
risk in [safe, sensitive, elevated]  →  requiresConfirmation = false
```

### 1.3 EndpointSchema 变更

```ts
interface EndpointSchema {
  endpoint:     string;
  summary:      string;
  description?: string;

  payload:   JSONSchema;
  response?: JSONSchemaProperty;

  // 【变更】classification 替代手写 tags
  classification: EndpointClassification;

  // 【变更】tags 变为 registry 派生的只读视图，schema 文件不再手写
  // tags?: EndpointTag[];   ← 删除

  // 其余字段不变
  minKernelVersion?: string;
  deprecated?: { ... };
  multipart?: { fileFields: string[] };
  cli?: CliBehavior;
  guard?: GuardSpec;
}
```

---

## 2. Guard — Payload 映射

### 2.1 PayloadTargetSpec（新增，替代 GuardSpec.payload）

```ts
// src/core/schema.ts

type ResourceKind =
  | "id"             // SiYuan block/doc ID → 需运行时解析成 {notebook, path}
  | "notebook"       // notebook ID，直接用于 content.{read|write}.notebooks 检查
  | "path"           // SiYuan path（/xxx/yyy.sy），直接用于 content.{read|write}.paths
  | "workspace-path";// 工作空间文件路径（/data/...），用于 workspace.{read|write}.paths

interface PayloadTargetSpec {
  field:   string;        // payload 中的字段名
  kind:    ResourceKind;
  access:  "read" | "write";
  when?:   {             // 条件激活（tool inputRefs 场景）
    field:   string;
    equals?: unknown;
    in?:     unknown[];
  };
}

// GuardSpec 变更：
interface GuardSpec {
  // 【变更】payload → payloadTargets
  payloadTargets?: PayloadTargetSpec[];

  // response 侧保持不变
  response?: {
    itemsAt: string;
    fieldMap: Partial<Record<GuardFieldKind, string>>;
  };
  filterResponse?: (response: unknown, engine: PermissionEngineLike) => unknown;
}
```

### 2.2 典型 API 示例

**block.updateBlock（单 ID 写）**
```ts
guard: {
  payloadTargets: [
    { field: "id", kind: "id", access: "write" },
  ]
}
```

**block.moveBlock（三 ID，各独立检查）**
```ts
guard: {
  payloadTargets: [
    { field: "id",         kind: "id", access: "write" },
    { field: "parentID",   kind: "id", access: "write" },
    { field: "previousID", kind: "id", access: "write" },
  ]
}
```

**block.insertBlock（补充，当前无 guard）**
```ts
guard: {
  payloadTargets: [
    { field: "parentID",   kind: "id", access: "write" },
    { field: "previousID", kind: "id", access: "write" },
    { field: "nextID",     kind: "id", access: "write" },
  ]
}
```

**append-content tool（条件激活）**
```ts
inputRefs: [
  { field: "targetId", kind: "notebook", access: "write",
    when: { field: "targetType", equals: "dailynote" } },
  { field: "targetId", kind: "id",       access: "write",
    when: { field: "targetType", in: ["document", "block"] } },
]
```

---

## 3. ID Resolver

### 3.1 接口

```ts
// src/core/permission.ts

interface PermissionEngineLike {
  checkDeny(item: { id?: string; path?: string; notebook?: string }): { allowed: boolean; reason?: string };
  filterItems<T>(...): { kept: T[]; removed: number; reasons: Record<string, number> };

  // 【新增】
  resolveContentId(id: string): Promise<{ notebook: string; path: string }>;
  checkContentRef(ref: { kind: ResourceKind; value: string; access: "read" | "write" }): Promise<void>;
  checkTool(id: string): void;
}
```

### 3.2 resolveContentId 实现

```ts
// 内部实现，绕过 endpoint guard 直接调 SQL（避免递归）
async resolveContentId(id: string): Promise<{ notebook: string; path: string }> {
  if (this.idCache.has(id)) return this.idCache.get(id)!;

  const rows = await this.rawSqlQuery<{ box: string; path: string }>(
    `SELECT box, path FROM blocks WHERE id = '${escapeId(id)}' LIMIT 1`
  );
  if (!rows.length) throw new ContentAccessDeniedError(`Block id "${id}" not found`);

  const result = { notebook: rows[0].box, path: rows[0].path };
  this.idCache.set(id, result);
  return result;
}
```

- `idCache`: `Map<string, {notebook, path}>` — 单次请求生命周期内缓存
- `rawSqlQuery`: 直接调内核 `/api/query/sql`，不经过 endpoint guard

---

## 4. Guard 执行流程

```
executeEndpoint(opts)
  │
  ├─ 1. engine.checkEndpoint(id)         — endpoint allow/deny
  │
  ├─ 2. applyPayloadGuard(schema, payload, engine)   [async]
  │       │
  │       ├─ for each payloadTargets entry:
  │       │     kind == "id"        → engine.resolveContentId(value)
  │       │                           → {notebook, path}
  │       │     kind == "notebook"  → {notebook: value}
  │       │     kind == "path"      → {path: value}
  │       │     kind == "workspace-path" → workspace path check
  │       │
  │       └─ engine.checkContentRef({kind, value, access})
  │               → 对应 content.{read|write} 或 workspace.{read|write} 规则
  │
  ├─ 3. dry-run / debug preview
  │
  ├─ 4. engine.requiresConfirmation(schema) && !yes → throw ConfirmationRequiredError
  │
  ├─ 5. client.call() / client.upload()
  │
  └─ 6. applyResponseGuard(schema, response, engine)
           → response.itemsAt + fieldMap  (declarative)
           → filterResponse()             (imperative hook)
```

Guard 接口变为 async（因 id resolver 是异步的）：

```ts
// src/core/guard.ts
export async function applyPayloadGuard(
  schema: EndpointSchema,
  payload: unknown,
  engine: PermissionEngineLike,
): Promise<void>

export async function executeEndpoint(opts: ExecuteOptions): Promise<unknown>
```

---

## 5. Permission Config

### 5.1 新结构

```ts
// src/core/config.ts

interface ContentScopeRule {
  notebooks?: { deny?: string[]; allow?: string[] };
  paths?:     { deny?: string[]; allow?: string[] }; // SiYuan path，支持 glob
}

interface WorkspaceScopeRule {
  paths?: { deny?: string[]; allow?: string[] }; // 工作空间文件路径，支持 glob
}

interface ConfirmPolicy {
  modes?:    EndpointMode[];    // 触发确认的 mode（默认: ["write", "invoke"]）
  surfaces?: EndpointSurface[]; // 额外触发确认的 surface（默认: ["workspace", "runtime", "network"]）
  scopes?:   EndpointScope[];   // 额外触发确认的 scope（默认: ["batch", "global"]）
}

interface PermissionConfig {
  endpoints?: { allow?: string[]; deny?: string[] };  // glob，匹配 endpoint id（如 "file.*"）
  tools?:     { allow?: string[]; deny?: string[] };  // glob，匹配 tool id

  content?: {
    read?:  ContentScopeRule;
    write?: ContentScopeRule;
  };

  workspace?: {
    read?:  WorkspaceScopeRule;
    write?: WorkspaceScopeRule;
  };

  confirm?: ConfirmPolicy;

  // 【保留向后兼容】旧 guardWrite 在读配置时自动映射到 confirm.modes
  guardWrite?: boolean;
}
```

### 5.2 YAML 示例

```yaml
workspaces:
  prod:
    baseUrl: http://prod:6806
    permission:
      endpoints:
        deny: ["system.exit", "network.*", "file.*"]

      tools:
        allow: ["append-content", "list-doc-tree"]

      content:
        read:
          notebooks:
            allow: ["20240101000000-abcdefg"]
        write:
          notebooks:
            allow: ["20240101000000-abcdefg"]
          paths:
            deny: ["/系统/**", "/模板/**"]

      workspace:
        read:
          paths:
            deny: ["**"]          # 完全封闭 /api/file/getFile
        write:
          paths:
            deny: ["**"]          # 完全封闭 /api/file/putFile

      confirm:
        modes: ["write", "invoke"]
        surfaces: ["workspace", "runtime", "network"]
        scopes: ["batch", "global"]
```

---

## 6. Tool Capability

```ts
// src/core/schema.ts

interface ToolCapability {
  read?:   Array<"meta" | "content" | "asset" | "workspace">;
  write?:  Array<"content" | "asset" | "workspace">;
  invoke?: Array<"runtime" | "network">;
}

interface ToolSchema {
  // ...existing fields...
  capability?: ToolCapability; // 【新增】声明 tool 可读/写的 surface 上界
}
```

**运行时 tool 权限检查双层：**

```
tool.run(ctx, input)
  │
  ├─ 1. engine.checkTool(tool.id)           — tools allow/deny
  │
  └─ 2. ctx.callEndpoint(id, payload)
           └─ executeEndpoint()             — 完整 guard 链路（同普通 API 调用）
```

---

## 7. Classification 全量示例

| Endpoint | mode | surface | scope | operation | risk (derived) |
|---|---|---|---|---|---|
| `system.version` | read | meta | single | inspect | safe |
| `system.getConf` | read | meta | single | inspect | safe |
| `system.exit` | invoke | runtime | single | control | destructive |
| `system.logoutAuth` | invoke | runtime | single | control | destructive |
| `sqlite.flushTransaction` | invoke | runtime | single | control | destructive |
| `notification.pushMsg` | invoke | runtime | single | control | destructive |
| `query.sql` | read | content | global | query | sensitive |
| `search.fullTextSearchBlock` | read | content | global | search | sensitive |
| `block.getBlockKramdown` | read | content | single | inspect | sensitive |
| `block.getBlockDOM` | read | content | single | inspect | sensitive |
| `block.updateBlock` | write | content | single | update | elevated |
| `block.deleteBlock` | write | content | single | delete | elevated |
| `block.moveBlock` | write | content | single | move | elevated |
| `block.insertBlock` | write | content | single | create | elevated |
| `filetree.removeDoc` | write | content | single | delete | elevated |
| `filetree.removeDocByID` | write | content | single | delete | elevated |
| `notebook.removeNotebook` | write | content | single | delete | elevated |
| `asset.upload` | write | asset | single | upload | elevated |
| `file.getFile` | read | workspace | single | inspect | elevated |
| `file.readDir` | read | workspace | single | inspect | elevated |
| `file.putFile` | write | workspace | single | update | critical |
| `file.removeFile` | write | workspace | single | delete | critical |
| `file.renameFile` | write | workspace | single | move | critical |
| `network.forwardProxy` | invoke | network | single | control | critical |

---

## 8. Before / After 对比

### API schema 文件

```ts
// BEFORE
export const schema: EndpointSchema = {
  endpoint: "/api/block/deleteBlock",
  summary: "Delete block",
  payload: { ... },
  tags: ["write", "mutation", "dangerous"],
  guard: { payload: { id: "id" } },
};

// AFTER
export const schema: EndpointSchema = {
  endpoint: "/api/block/deleteBlock",
  summary: "Delete block",
  payload: { ... },
  classification: {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "delete",
  },
  // tags 由 registry 自动派生：["mode:write", "surface:content", "scope:single", "operation:delete"]
  // risk 自动派生："elevated"
  guard: {
    payloadTargets: [
      { field: "id", kind: "id", access: "write" },
    ],
  },
};
```

```ts
// BEFORE — moveBlock 多字段覆盖 bug
guard: { payload: { id: "id", previousID: "id", parentID: "id" } }
// → applyPayloadGuard 只检查最后一个 parentID

// AFTER — 三字段各自独立检查
guard: {
  payloadTargets: [
    { field: "id",         kind: "id", access: "write" },
    { field: "parentID",   kind: "id", access: "write" },
    { field: "previousID", kind: "id", access: "write" },
  ]
}
```

### isWriteEndpoint 判断

```ts
// BEFORE
function isWriteEndpoint(schema: EndpointSchema): boolean {
  const tags = schema.tags ?? [];
  return tags.includes("write") || tags.includes("mutation")
    || tags.includes("dangerous") || tags.includes("upload");
}

// AFTER
function isWriteEndpoint(schema: EndpointSchema): boolean {
  return schema.classification.mode === "write"
    || schema.classification.mode === "invoke";
}
```

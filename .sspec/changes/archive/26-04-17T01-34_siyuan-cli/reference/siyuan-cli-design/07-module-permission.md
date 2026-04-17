# 07 · Permission 模块（三段论安全过滤）

> 本篇要回答什么：用户的 deny 规则怎么落地？不同 API 返回结构各异，怎么知道过滤哪里？Tool 怎么接入？

## 1. 设计思路：把三件事拆开

原方案（v1）用单一的 `filterResponse` 接口试图一揽子处理，结果导致"到底怎么从任意 response 里定位 id/path/notebook"没法落地。

v2 把它拆成三块，每块职责单一：

| 职责 | 谁定义 | 谁执行 | 数据类型 |
| --- | --- | --- | --- |
| **规则**（Rules） | 用户（config.yaml） | 框架加载时解析 | `{ notebooks: {deny, allow}, paths: {deny, allow} }` |
| **引擎**（Engine） | 框架 | 运行时调用 | `checkDeny({id?, path?, notebook?}) → {allowed, reason}` |
| **提取器**（Extractor） | 每个 API / Tool 自己 | 框架 / Tool 运行时调用引擎 | schema 声明式 / 命令式 hook |

关键点：

- **不是每个 API 都要提取器**。像 `system.version` 返回的内容里根本没有 id/path/notebook，guard 可以完全省略
- **提取器是"schema 局部知识"**，而规则和引擎是全局的
- **Tool 代码里按需调引擎**，不用单独声明提取器（Tool 本来就是代码）

## 2. 规则层：用户配置

### 2.1 配置形态（已在 03 定义，这里重申）

```yaml
permission:
  api:
    disabled: ["system.exit", "export.*"]
    enabled: []                          # 空 = 黑名单模式

  content:
    notebooks:
      deny: ["20210817205410-2kvfpfn"]
      allow: []                          # 空 = 黑名单模式

    paths:
      deny:
        - "/20260416.../20260417abc.sy"
        - "/20260416.../20260417abc/**"
      allow: []

  guardWrite: true
```

**Path 是思源 path**，不是 hpath（见 03 §2）。

### 2.2 规则语义

- `allow` 与 `deny` 同时存在 → 先过 `allow`（不命中直接拒），再过 `deny`（命中拒）
- `allow` 为空 / 未设 → 只走 `deny`（黑名单模式）
- `allow` 非空 → 白名单模式，未命中即拒
- 跨维度（notebooks + paths）是 **AND** 关系：任何一维拒绝即拒绝

## 3. 引擎层：统一决策接口

### 3.1 接口

```ts
export interface PermissionEngine {
  // ——— endpoint 级（见 04 §5） ———
  checkEndpoint(id: string): void;       // 抛 EndpointDisabledError

  // ——— item 级（核心） ———
  checkDeny(item: {
    id?: string;                         // 块 / 文档 ID
    path?: string;                       // 思源 path
    notebook?: string;                   // notebook ID
  }): { allowed: boolean; reason?: string };

  // ——— 批量 ———
  filterItems<T>(
    items: T[],
    extract: (item: T) => { id?: string; path?: string; notebook?: string }
  ): { kept: T[]; removed: number; reasons: Record<string, number> };

  // ——— 写保护 ———
  requiresConfirmation(endpoint: EndpointSchema): boolean;
}
```

### 3.2 `checkDeny` 实现（伪码）

```ts
checkDeny(item) {
  const { notebooks, paths } = this.rules.content ?? {};

  // notebook 维度
  if (item.notebook) {
    if (notebooks?.allow?.length && !notebooks.allow.includes(item.notebook))
      return { allowed: false, reason: `notebook ${item.notebook} not in allow list` };
    if (notebooks?.deny?.includes(item.notebook))
      return { allowed: false, reason: `notebook ${item.notebook} in deny list` };
  }

  // path 维度
  if (item.path) {
    if (paths?.allow?.length && !micromatch.isMatch(item.path, paths.allow))
      return { allowed: false, reason: `path ${item.path} not in allow list` };
    if (paths?.deny?.length && micromatch.isMatch(item.path, paths.deny))
      return { allowed: false, reason: `path ${item.path} in deny list` };
  }

  // id 暂无直接规则，但未来可扩（比如某些 block id 列入黑名单）
  return { allowed: true };
}
```

### 3.3 `filterItems` 实现

```ts
filterItems(items, extract) {
  const kept: T[] = [];
  let removed = 0;
  const reasons: Record<string, number> = {};
  for (const it of items) {
    const res = this.checkDeny(extract(it));
    if (res.allowed) {
      kept.push(it);
    } else {
      removed++;
      reasons[res.reason!] = (reasons[res.reason!] ?? 0) + 1;
    }
  }
  return { kept, removed, reasons };
}
```

### 3.4 `requiresConfirmation`

```ts
requiresConfirmation(endpoint) {
  if (!this.rules.guardWrite) return false;
  return endpoint.tags?.includes("mutation") === true
      || endpoint.tags?.includes("dangerous") === true;
}
```

## 4. 提取器层：每个 API 的"局部知识"

### 4.1 声明式 guard（够用场景占 95%）

在 EndpointSchema 中：

```ts
guard?: {
  // 请求前：payload 的某些字段是 id/path/notebook，检查它们
  payload?: Record<string, GuardFieldKind>;

  // 响应后：从 response 提取条目列表，按 fieldMap 抽字段，逐项过滤
  response?: {
    itemsAt: string;                     // 极简 jsonpath: "data[*]" / "data.blocks[*]"
    fieldMap: Partial<Record<GuardFieldKind, string>>;
  };

  // 命令式 hook 兜底（见 §4.3）
  filterResponse?: (response: unknown, engine: PermissionEngine) => unknown;
};

type GuardFieldKind = "id" | "path" | "notebook";
```

### 4.2 声明示例

**例 1：`/api/query/sql`**（响应是 block 数组）

```ts
guard: {
  response: {
    itemsAt: "data[*]",
    fieldMap: { id: "id", path: "path", notebook: "box" },
  },
}
```

运行时框架做：

```ts
const items = jsonpathGet(response, "data[*]");   // 拿到 block 数组
const { kept, removed } = engine.filterItems(items, b => ({
  id: b.id, path: b.path, notebook: b.box,
}));
response.data = kept;
// 可选：在 stderr 打印 [warn] filtered N items
return response;
```

**例 2：`/api/block/getBlockKramdown`**（请求前检查）

```ts
guard: {
  payload: { id: "id" },                 // payload.id 是 block id
}
```

运行时：

```ts
const { id } = payload;
const res = engine.checkDeny({ id });
if (!res.allowed) throw new ContentAccessDeniedError(res.reason);
```

**例 3：`/api/system/version`**（无 guard 字段，框架跳过，零开销）

```ts
// 不声明 guard
```

### 4.3 命令式 hook（兜底 5%）

声明式搞不定时（响应结构嵌套复杂、需要根据某字段的值决定逻辑），写函数：

```ts
guard: {
  payload: { notebook: "notebook", path: "path" },
  filterResponse: (response, engine) => {
    // 举例：/api/filetree/listDocsByPath 返回 { data: { files: [...], path: "..." } }
    const files = response.data.files;
    const { kept, removed } = engine.filterItems(files, f => ({
      id: f.id,
      path: f.path,
      notebook: f.box ?? response.data.box,   // 某些字段要从上下文推
    }));
    response.data.files = kept;
    return response;
  },
},
```

### 4.4 极简 jsonpath 规范（不引入依赖）

只支持两种语法：

- `field` / `field.subfield` / `field.sub.subsub`：字段点击穿
- `field[*]`：数组的每个元素

组合：`data[*].children[*]` 合法；但不支持 `data[*].*`、通配表达式、过滤表达式等。

实现 20 行代码即可，无需引入 jsonpath 库。

## 5. 启发式兜底（"默认提取器"）

很多 API 即便没声明 guard，payload 中也可能带 id/path/notebook 字段。框架提供一层 **启发式扫描**：

**启发规则**（请求前）：

```ts
function heuristicPayloadGuard(payload, engine) {
  const lookup: Record<string, "id" | "path" | "notebook"> = {
    id: "id", blockId: "id", blockID: "id",
    parentID: "id", parentId: "id",
    rootID: "id", rootId: "id", docID: "id", docId: "id",
    path: "path",
    notebook: "notebook", box: "notebook", notebookID: "notebook",
  };
  const item: { id?: string; path?: string; notebook?: string } = {};
  for (const [k, kind] of Object.entries(lookup)) {
    if (typeof payload[k] === "string") item[kind] = payload[k];
  }
  if (Object.keys(item).length > 0) {
    const res = engine.checkDeny(item);
    if (!res.allowed) throw new ContentAccessDeniedError(res.reason);
  }
}
```

**调用顺序**：

```
executeEndpoint:
  1. engine.checkEndpoint(id)                    # 启用检查
  2. if schema.guard?.payload:                   # 声明式 payload guard（优先）
        apply schema guard
     else:
        heuristicPayloadGuard(payload, engine)   # 未声明则兜底
  3. send request
  4. if schema.guard?.filterResponse:            # 命令式 hook 优先
        response = filterResponse(response, engine)
     elif schema.guard?.response:
        apply declarative extractor
     else:
        响应不过滤（框架不猜）
```

**设计判断**：响应阶段 **不做启发式** —— 响应结构千差万别，猜错了容易把正常数据过滤掉，或者遗漏真正该过滤的。请求阶段的启发式是"多一层保险"，响应阶段必须显式声明。

## 6. Tool 层的接入

Tool 通过 `ctx.permission` 拿到同一个引擎：

```ts
async run(ctx, input) {
  // 方式 A：调 API，由框架走 schema.guard
  const res = await ctx.callEndpoint("query.sql", { stmt });

  // 方式 B：对自己处理的中间结果单项检查
  const { allowed } = ctx.permission.checkDeny({ id: someBlockId });
  if (!allowed) throw new Error("target is denied");

  // 方式 C：批量过滤
  const { kept, removed } = ctx.permission.filterItems(res.data, b => ({
    id: b.id, path: b.path, notebook: b.box,
  }));

  return { content: render(kept), details: { data: kept }, meta: { filteredCount: removed } };
}
```

## 7. 可观察性

- 每次过滤掉条目都记入 `meta.filteredCount`
- `--debug` 时 stderr 打印 `[permission] filtered N items: <reason summary>`
- 永不在 stdout 插入过滤信息（会污染 JSON）

## 8. 写保护（guardWrite）

`requiresConfirmation` 返回 true 时：

```
$ siyuan api block.deleteBlock --id 20260417...
Error: this endpoint has tag [mutation] and guardWrite is enabled.
Re-run with --yes to confirm, or --dry-run to preview.
```

**Agent 调用建议**：在 Skill 里提示 Agent 写操作默认带 `--dry-run`，确认 payload 符合预期后再加 `--yes`。

## 9. 错误类型

```ts
class EndpointDisabledError extends Error {           // exit 4
  code = "ENDPOINT_DISABLED";
  constructor(public endpoint: string, public reason: string) { super(`...`); }
}

class ContentAccessDeniedError extends Error {        // exit 4
  code = "CONTENT_ACCESS_DENIED";
  constructor(public reason: string) { super(`...`); }
}

class ConfirmationRequiredError extends Error {       // exit 2
  code = "CONFIRMATION_REQUIRED";
  constructor(public endpoint: string) { super(`...`); }
}
```

所有错误都以结构化 JSON 打到 stderr（见 04 §7）。

## 10. 一期权限矩阵（建议的 API guard 声明）

| endpoint | 请求前 guard | 响应后 guard |
| --- | --- | --- |
| `system.version` | — | — |
| `system.bootProgress` | — | — |
| `query.sql` | —（无法从 SQL 静态提取） | `itemsAt:data[*]`, fieldMap id/path/box |
| `notebook.lsNotebooks` | — | `itemsAt:data.notebooks[*]`, fieldMap notebook=id |
| `notebook.createNotebook` | `name: ...`（不走 guard） | — |
| `filetree.listDocsByPath` | `notebook: "notebook", path: "path"` | 命令式 hook（见 §4.3 例 3） |
| `filetree.createDocWithMd` | `notebook: "notebook", path: "path"` | — |
| `filetree.renameDocByID` | `id: "id"` | — |
| `filetree.removeDocByID` | `id: "id"` | — |
| `filetree.getHPathByID` | `id: "id"` | — |
| `block.getBlockKramdown` | `id: "id"` | — |
| `block.appendBlock` | `id: "parentID"` | — |
| `block.insertBlock` | `id: "parentID"` | — |
| `block.updateBlock` | `id: "id"` | — |
| `block.deleteBlock` | `id: "id"` | — |
| `attr.getBlockAttrs` | `id: "id"` | — |
| `attr.setBlockAttrs` | `id: "id"` | — |
| `search.fullTextSearchBlock` | — | `itemsAt:data.blocks[*]`, fieldMap id/path/box |
| `export.exportMdContent` | `id: "id"` | — |
| `asset.upload` | —（pure 上传，不关联 block） | — |
| `notification.pushMsg` | — | — |

按此矩阵实现，权限覆盖率在 95% 以上。剩下的 5% 按需写命令式 hook。

## 11. 测试

- `tests/permission/engine.test.ts`：checkDeny / filterItems 的核心逻辑
- `tests/permission/guard-payload.test.ts`：声明式 payload guard 正确解释字段映射
- `tests/permission/guard-response.test.ts`：响应过滤不破坏原结构
- `tests/permission/heuristic.test.ts`：未声明 guard 时启发式兜底

---

下一篇 `08-roadmap.md` 给出里程碑；`09-open-questions.md` 列出仍未拍板的点。

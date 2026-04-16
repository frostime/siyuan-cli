# 05 · Tool 模块（业务封装）

> 本篇要回答什么：Tool 和 API 的边界在哪？内置 Tool 清单？输入源规则？输出契约？

## 1. Tool 的本质

Tool = **预制的 workflow**，把多个 API 调用 / 参数转换 / 结果格式化封装成单命令。

**判断标准**：如果一个 Agent 任务需要"先调 A 拿到 X，再用 X 调 B，再整理 C 的字段"，这个流程就应该变成 Tool。

## 2. ToolSchema 规范（v2）

```ts
export interface ToolSchema {
  id: string;                           // kebab-case: "list-doc-tree"
  summary: string;
  description?: string;
  tags?: ToolTag[];                     // "read" | "write" | "aggregate" | "util"

  input: JSONSchema;                    // 输入参数 schema
  output?: JSONSchema;                  // 仅文档用，不做运行时校验

  cli?: {
    primary?: string;
    examples?: Array<{ command: string; description?: string }>;
    aliases?: Record<string, string>;
    allowSource?: Record<string, InputSource[]>;
  };

  // 实现体 —— 返回 { content, details }
  run: (ctx: ToolContext, input: unknown) => Promise<ToolResult>;
}

export interface ToolResult {
  content: string;                      // 人类 / Agent 可直接读
  details?: unknown;                    // 结构化补充
  warnings?: string[];                  // 非致命警告
  // 下面这些走 stderr（不影响 stdout 契约）
  meta?: {
    elapsedMs?: number;
    filteredCount?: number;             // 被权限引擎过滤掉的条目数
    truncated?: boolean;                // content 是否被截断
  };
}

export interface ToolContext {
  client: SiyuanClient;
  registry: Registry;
  permission: PermissionEngine;

  // 调用 kernel API，内部自动走权限检查 + response guard
  callEndpoint: <T = unknown>(id: string, payload: unknown) => Promise<T>;

  // 后门：不走 response guard。慎用，Tool 要自己负责过滤
  callEndpointRaw: <T = unknown>(id: string, payload: unknown) => Promise<T>;

  logger: Logger;
  args: GlobalArgs;
}
```

**关键约束**：Tool 调用 kernel API **默认** 走 `ctx.callEndpoint`，结果已经过 response guard。Tool 在自身逻辑里对 id/path/notebook 还可再次调用 `ctx.permission.checkDeny(...)` 或 `ctx.permission.filterItems(...)`。

## 3. 输出契约（**v2 关键变更**）

### 3.1 默认行为

```bash
siyuan tool list-doc-tree --entry <id>
```

stdout 只输出 `content`（纯文本）：

```
# 文档树：开发笔记

- 笔记本 A (42 篇)
  - 产品设计/
    - PRD-v1
    - 用户画像
  - …

深度 2 内共 42 项，3 棵子树被截断。使用 --details 获取完整结构，使用 --depth 展开更深。
```

### 3.2 开关

| flag | 行为 |
| --- | --- |
| 无 | 只输出 `content` |
| `--details` | 输出 `{ content, details }` 完整 JSON |
| `--only details` | 只输出 `details` 的 JSON（无 content 包装，便于 `jq`） |
| `--only content` | 显式只要 content（默认值的别名） |
| `--format json` | 所有 stdout 以 JSON 形式，`content` 字段被转义为字符串 |
| `--format pretty` | content 以高亮文本输出，details 以缩进 JSON |

### 3.3 content 的写法规范

Tool 写 `content` 时要照顾 Agent 的 token 消耗：

- 按重要性降序排
- 超过阈值（默认 100 行 / 4KB）自动截断，尾部加 `… 用 --details 获取完整结构`
- 关键数字用 `key: value` 行格式（方便正则提取）
- 避免过度 emoji 和装饰符

### 3.4 meta / warnings 输出

- `warnings` 打印到 stderr（一行一条，前缀 `[warn]`）
- `meta` 仅在 `--debug` 时打印到 stderr
- `content` 和 `details` 永远在 stdout

### 3.5 失败约定

失败时 `run` 应该抛异常。框架捕获后输出：

**stderr**：

```json
{"level":"error","code":"TOOL_INPUT_INVALID","tool":"list-doc-tree","message":"entry is required"}
```

**stdout**：空

exit code：与 API 层一致（见 04 §7）。

## 4. 内置 Tool 清单（MVP）

### 4.1 `list-doc-tree` —— 列出文档树

```
USAGE
  siyuan tool list-doc-tree --entry <doc-id|notebook-id> [--depth <n>]

INPUT
  entry       (required, string)  根节点 ID
  depth       (integer, default 2) 展开深度；-1 不限
  includeMeta (boolean, default false) 是否在 details 中附 hPath/title/type

CONTENT
  Markdown 列表，按层级缩进

DETAILS
  {
    "root": { id, notebook, hPath, title },
    "tree": [ { id, title, hPath, children: [...] } ],
    "stats": { nodeCount, truncatedSubtrees: [] }
  }

IMPL
  1. 判断 entry 是 notebook ID（调 notebook.lsNotebooks 对照）还是 doc ID
  2. 用 query.sql 递归拉取子文档（WHERE parent_id = ? 或路径前缀）
  3. 按 depth 截断，记录被截断的子树
```

### 4.2 `list-dailynote` —— 列出 daily note

```
USAGE
  siyuan tool list-dailynote [--date <YYYY-MM-DD|today>] [--mode at|before|after] [--filter-notebook <id>]

INPUT
  date            (string, default "today")
  mode            (enum, default "at")      at | before | after
  filterNotebook  (string, optional)

CONTENT
  # Daily Notes (2026-04-16 及之前 10 条)
  - 2026-04-16 [20260416...] /笔记本A/daily note/2026-04-16
  - 2026-04-15 [20260415...] /笔记本A/daily note/2026-04-15
  ...

DETAILS
  { "entries": [ { id, notebook, hpath, path, created } ] }

IMPL
  query.sql: SELECT id, box, hpath, path, created FROM blocks
             WHERE type='d' AND hpath LIKE '%/daily note/%'
             [AND box = ?]
             [AND created 的条件]
             ORDER BY created DESC LIMIT 100
```

### 4.3 `append-content` —— 统一追加内容

把"追加到 dailynote / 文档 / 块"抹平：

```
USAGE
  siyuan tool append-content \
    --target-id <id> --target-type <dailynote|document|block> \
    --markdown <string|@file:path|@stdin>

INPUT
  targetId     (required, string)
  targetType   (required, enum)     dailynote | document | block
  markdown     (required, string)

CLI
  allowSource: { markdown: ["literal", "file", "stdin"] }

CONTENT
  已追加到 [<targetType>] <targetId>（<n> 字节，<m> 个块）

DETAILS
  { "insertedBlockIds": ["...", "..."], "parentID": "..." }

IMPL
  switch targetType:
    case dailynote:
      1. 如 targetId 是 notebook，查今天的 daily note id；若不存在 /api/filetree/createDailyNote
      2. block.appendBlock(parentID=<daily note id>, data=markdown)
    case document:
    case block:
      block.appendBlock(parentID=<targetId>, data=markdown)
```

### 4.4 `create-doc` —— 以 anchor 语法创建文档

**用户原文**：`--anchor <[docid]:parent | [docid]:sibling | [docid]:children>`

```
USAGE
  siyuan tool create-doc --title <title> --anchor <anchor> --markdown <markdown>

ANCHOR 语法
  <docid>:parent       作为 docid 的父级（即 docid 移到新文档下；谨慎）
  <docid>:sibling      作为 docid 的兄弟（同目录）
  <docid>:children     作为 docid 的子文档（默认）
  root:<notebookId>    作为 notebook 的根级文档

CLI
  allowSource: { markdown: ["literal", "file", "stdin"] }

CONTENT
  已创建文档 "<title>" [<id>]
  路径：<hpath>
  思源 path：<path>

DETAILS
  { "id": "...", "notebook": "...", "path": "...", "hpath": "..." }

IMPL
  1. 解析 anchor
  2. root:<notebookId>：
       filetree.createDocWithMd(notebook=<id>, path="/"+title, markdown=...)
  3. <docid>:children：
       filetree.getHPathByID(id=docid) → hPath
       filetree.createDocWithMd(notebook=<docid 所在 box>, path=hPath+"/"+title, markdown=...)
  4. sibling / parent 同理
```

### 4.5 `resolve-path` —— hpath / id → 思源 path（**v2 新增**）

```
USAGE
  siyuan tool resolve-path [--hpath <hpath>] [--id <blockId>]

INPUT
  hpath  (string, optional)  按 hpath 查找（可能多条）
  id     (string, optional)  按 block/doc ID 查找（最多一条）

约束：hpath 与 id 必须恰好一个

CONTENT
  找到 <n> 个匹配：
  - /20260416.../20260417abc.sy   (hpath=/私人/日记, id=20260417...)

DETAILS
  {
    "matches": [
      { "id": "...", "notebook": "...", "path": "...", "hpath": "..." }
    ]
  }

IMPL
  query.sql:
    hpath 模式: SELECT id, box, path, hpath FROM blocks WHERE type='d' AND hpath=?
    id 模式:    SELECT id, box, path, hpath FROM blocks WHERE id=?
```

**用途**：用户配置 `permission.content.paths.deny` 时，先用此 Tool 把人类可读的 hpath 解析到稳定的 path，再粘贴到 config.yaml。

### 4.6 其它可选 Tool（V0.2+）

| Tool | 描述 |
| --- | --- |
| `search-blocks` | 封装 search.fullTextSearchBlock + 结果整理 |
| `get-doc-markdown` | `export.exportMdContent` 包装，支持传 hpath（先转 id） |
| `move-doc` | 移动文档（多步 API 组合） |
| `backup-notebook` | 导出整个 notebook 为 zip |
| `upload-and-embed` | 上传资源并返回 `![xx](assets/...)` 语法 |
| `graph-backlinks` | 某块的反链列表 |

每个 Tool 都必须有 `cli.examples` 以支撑 Agent 读 `-h` 即可上手。

## 5. 输入来源（与 API 层一致）

Tool 的 `cli.allowSource` 规则 **与 API 完全一致**，见 04 §2：

- `@file:<path>` / `@stdin` / `@env:VAR` / 字面值
- 未声明的字段只接受字面值（安全默认）
- `@stdin` 整个调用只能出现一次
- 转义：`@@file:xxx` 表示字面值 `@file:xxx`

Tool 对常见文本输入字段（`markdown`、`content`、`stmt`）应声明 `["literal", "file", "stdin"]`；对 ID 字段只允许 `["literal"]`。

## 6. Tool 层的权限协作

Tool 通过三种方式与权限引擎协作：

1. **自动**：`ctx.callEndpoint(id, payload)` 内部已走 endpoint 级启用检查 + API schema 的 guard
2. **主动单检**：Tool 拿到中间结果后，对关心的 id/path/notebook 调 `ctx.permission.checkDeny({ id, path, notebook })`；若返回 `allowed: false`，Tool 决定是跳过、报错还是继续
3. **批量过滤**：`ctx.permission.filterItems(items, extractor)` 一次过滤整个数组；返回 `{ kept, removed }`

示例（伪码）：

```ts
async run(ctx, input) {
  const res = await ctx.callEndpoint("query.sql", { stmt: "..." });
  const blocks = res.data as Block[];

  const { kept, removed } = ctx.permission.filterItems(blocks, b => ({
    id: b.id,
    path: b.path,
    notebook: b.box,
  }));

  return {
    content: renderTree(kept),
    details: { tree: kept },
    meta: { filteredCount: removed },
  };
}
```

## 7. `siyuan tool list` / `describe`

对称于 `siyuan api list / describe`。

```
siyuan tool list
siyuan tool list --tag read
siyuan tool list --format json
siyuan tool describe list-doc-tree
```

## 8. 自定义 Tool 扩展点（v0.3+）

长期允许用户在 `~/.config/siyuan-cli/tools/*.ts` 或 `*.js` 放自定义 Tool。但这会引入动态加载安全问题，**v1.0 前不开放**。

过渡方案：支持 bash alias，用户定义 `~/.config/siyuan-cli/aliases.yaml`：

```yaml
aliases:
  my-workflow:
    description: "..."
    run: |
      #!/bin/bash
      siyuan api notebook.lsNotebooks
      # ...
```

调用 `siyuan tool my-workflow ...` 等价执行脚本。低风险、易实现。

---

下一篇 `06-module-skill.md` 展开 Skill 模块。

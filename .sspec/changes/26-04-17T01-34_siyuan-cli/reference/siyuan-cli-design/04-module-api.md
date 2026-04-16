# 04 · API 模块（Kernel API 直通）

> 本篇要回答什么：EndpointSchema 长什么样？`--help` 怎么生成？参数解析从 argv 到 payload 怎么做？禁用 / 启用怎么实现？

## 1. EndpointSchema 规范（v2）

每个思源 kernel API 在 `src/apis/<group>/<n>.ts` 中定义一个 EndpointSchema。

### 1.1 完整字段

```ts
export interface EndpointSchema {
  // ——— 身份：endpoint 是唯一权威字段 ———
  endpoint: string;                     // "/api/query/sql"
  // id / group / name 由 loader 派生：
  //   endpoint "/api/query/sql" → id="query.sql", group="query", name="sql"
  // 派生算法：/api/<group>/<camelCaseName> → <group>.<camelCaseName>

  // ——— 描述 ———
  summary: string;                      // 一句话，给 list 与 help 首行
  description?: string;                 // 长描述，--help 尾部

  // ——— 请求 payload（JSON Schema Draft 2020-12 子集） ———
  payload: JSONSchema;

  // ——— 响应（可选，仅用于 --describe / 类型生成） ———
  response?: JSONSchema;

  // ——— 元数据 ———
  tags?: EndpointTag[];
  minKernelVersion?: string;
  deprecated?: { replacement?: string; removeAt?: string; reason?: string };

  // ——— 上传 / 特殊传输 ———
  multipart?: { fileFields: string[] };

  // ——— CLI 行为 ———
  cli?: CliBehavior;

  // ——— 权限 guard（声明式） ———
  guard?: GuardSpec;
}

export type EndpointTag =
  | "read"
  | "write"
  | "mutation"                           // 会改变磁盘上的数据
  | "dangerous"                          // 默认禁用推荐
  | "upload"
  | "query";

export interface CliBehavior {
  // schema 中恰好一个 required string 字段时，允许位置参数
  // 例：`siyuan api query.sql "select ..."` 等价于 `--stmt "select ..."`
  primary?: string;

  // 示例命令片段
  examples?: Array<{ command: string; description?: string }>;

  // 短 flag 别名
  aliases?: Record<string, string>;     // { stmt: "s" }

  // 允许的输入来源（v2 关键变更：显式白名单）
  // 默认空数组 = 只允许 "literal"
  // 值是 @file:<path> / @stdin / @env:VAR / 字面值；哪些前缀被解释为特殊来源取决于 allowSource
  allowSource?: Record<string, InputSource[]>;
}

export type InputSource = "literal" | "file" | "stdin" | "env";
```

### 1.2 样例：`/api/query/sql`

`src/apis/query/sql.ts`：

```ts
import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/query/sql",           // ← 唯一身份字段
  summary: "通过 SQL 查询思源数据库",
  description: `执行任意只读 SQL。可用表参考 skills/siyuan-cli/references/sql-cheatsheet.md。
注意：虽然内核允许 write 操作，但本 CLI 的权限层默认只放行 SELECT。`,
  payload: {
    type: "object",
    required: ["stmt"],
    additionalProperties: false,
    properties: {
      stmt: { type: "string", description: "SQL 查询语句（仅 SELECT）" },
    },
  },
  tags: ["read", "query"],
  cli: {
    primary: "stmt",
    examples: [
      {
        command: 'siyuan api query.sql "SELECT id,content FROM blocks WHERE type=\'d\' LIMIT 5"',
        description: "列出前 5 个文档块",
      },
      {
        command: "siyuan api query.sql --stmt @file:./query.sql",
        description: "从文件读取 SQL",
      },
      {
        command: "cat query.sql | siyuan api query.sql --stmt @stdin",
        description: "从 stdin 读取 SQL",
      },
    ],
    allowSource: {
      stmt: ["literal", "file", "stdin"],
    },
  },
  // 见 07，SQL 的 guard 比较特殊
  guard: {
    response: {
      itemsAt: "data[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
```

### 1.3 样例：`/api/block/appendBlock`

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/block/appendBlock",
  summary: "在文档或块的末尾追加内容",
  payload: {
    type: "object",
    required: ["parentID", "data", "dataType"],
    additionalProperties: false,
    properties: {
      parentID: {
        type: "string",
        description: "目标文档 ID 或块 ID",
        pattern: "^\\d{14}-[0-9a-z]{7}$",
      },
      data: {
        type: "string",
        description: "要追加的内容（支持 Markdown / DOM）",
      },
      dataType: {
        type: "string",
        enum: ["markdown", "dom"],
        default: "markdown",
        description: "内容格式",
      },
    },
  },
  tags: ["write", "mutation"],
  cli: {
    examples: [
      { command: 'siyuan api block.appendBlock --parentID 2021... --data "hello"' },
      { command: "siyuan api block.appendBlock --parentID 2021... --data @file:./note.md" },
      { command: "cat note.md | siyuan api block.appendBlock --parentID 2021... --data @stdin" },
    ],
    allowSource: {
      data: ["literal", "file", "stdin"],
      // parentID 只允许字面值，防止误把文件路径注入进来
      parentID: ["literal"],
    },
  },
  guard: {
    payload: { parentID: "id" },        // payload.parentID 是 block/doc id
  },
};
```

### 1.4 样例（上传）：`/api/asset/upload`

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/asset/upload",
  summary: "上传资源文件",
  multipart: { fileFields: ["file[]"] },
  payload: {
    type: "object",
    required: ["file[]"],
    additionalProperties: false,
    properties: {
      "file[]": {
        type: "array",
        items: { type: "string" },
        description: "要上传的本地文件路径（可多个）",
      },
      assetsDirPath: {
        type: "string",
        default: "/assets/",
        description: "资源保存子目录",
      },
    },
  },
  tags: ["write", "upload", "mutation"],
  cli: {
    examples: [
      { command: "siyuan api asset.upload --file[] ./image.png" },
      { command: "siyuan api asset.upload --file[] ./a.png --file[] ./b.jpg" },
    ],
    // multipart 的文件字段不走 @file:，直接写路径
    allowSource: {},
  },
};
```

## 2. 输入来源规范（**v2 关键变更**）

### 2.1 显式前缀

所有字符串字段的值，若以下列前缀开头且该字段的 `allowSource` 包含对应项，则被解释为特殊来源：

| 前缀 | 含义 | 需要 `allowSource` 包含 |
| --- | --- | --- |
| `@file:<path>` | 从文件读（文本 → 字段值） | `"file"` |
| `@stdin` | 从标准输入读整个流 | `"stdin"` |
| `@env:VAR` | 从环境变量读 | `"env"` |
| `-`（独立一个字符） | `@stdin` 的别名，符合 Unix 惯例 | `"stdin"` |

若 `allowSource` **未** 包含对应项，前缀不被特殊解释，按字面值传递。

**转义**：若需要字面值 `@file:xxx` 而该字段恰好 `allowSource` 含 `"file"`，用 `@@file:xxx`（首 `@@` 转义为单 `@`）。

**默认**：`allowSource` 为空对象或未声明 → **所有字段只允许字面值**。这是安全默认。

### 2.2 @stdin 的单字段独占性

同一次调用中，`@stdin` 只能出现 **一次**。若有多个字段引用 `@stdin`，报错。

### 2.3 对 ID 类字段的约束

`payload` 中凡是思源 ID 字段（命名匹配 `id | *Id | *ID | parentID | rootID | blockID`），推荐：

- `allowSource` 不含 `"file"` / `"stdin"`（避免误注入，比如用户把一个 markdown 文件误当作 id）
- 字段 `pattern` 强校验 `^\d{14}-[0-9a-z]{7}$`

`04-module-api.md` 的样例默认按此执行。

## 3. argv → payload 映射

### 3.1 解析步骤

```
1. 扫描 global flag（--workspace --format --debug ...）
2. 扫描 payload 整体来源：-j/--json / -f/--file / -i/--interactive
    → 若有，解析成 base payload 对象
3. 扫描具名 flag：--<field> <value>
    → 每个字段按 allowSource 判断是否触发特殊来源解析
    → 叠加 / 覆盖 base
4. 扫描位置参数
    → 仅当 schema.cli.primary 有定义，赋给 primary 字段
5. 应用 JSON 反序列化（对声明 type: object/array 的字段，若值是字符串，尝试 JSON.parse）
6. ajv 验证
7. 发送请求
```

### 3.2 典型用法

**单字段快捷**：

```bash
siyuan api query.sql --stmt "select 1"
siyuan api query.sql "select 1"                 # schema.cli.primary = "stmt"
```

**从文件 / stdin**：

```bash
siyuan api query.sql --stmt @file:./query.sql
cat query.sql | siyuan api query.sql --stmt @stdin
cat query.sql | siyuan api query.sql --stmt -   # - 等价于 @stdin
```

**整个 payload 从 JSON**：

```bash
siyuan api query.sql --json '{"stmt":"select 1"}'
siyuan api query.sql -j '{"stmt":"select 1"}'
siyuan api query.sql -f payload.json            # 整体 JSON 从文件
siyuan api query.sql -f -                       # 整体 JSON 从 stdin
siyuan api query.sql -i                         # $EDITOR 打开空模板
```

**混合 / 叠加**：

```bash
siyuan api block.appendBlock \
  --json '{"dataType":"markdown"}' \
  --parentID 20210817205410-2kvfpfn \
  --data @file:./note.md
```

优先级：具名 flag > 位置参数 > `--json` > `-f file` > `-i`。

**实现时必须记录每个字段的"来源"**，`--debug` 输出时可见：

```
DEBUG: payload assembled from
  parentID ← --parentID (literal)
  data     ← --data @file:./note.md (file)
  dataType ← --json (default: markdown)
```

### 3.3 数组字段

```bash
siyuan api asset.upload --file[] ./a.png --file[] ./b.png
# 或 JSON
siyuan api asset.upload -j '{"file[]":["./a.png","./b.png"]}'
```

### 3.4 布尔字段

```bash
--keepFold                              # true
--no-keepFold                           # false
--keepFold=false                        # false
```

## 4. `--help` 生成

### 4.1 顶层 `siyuan api --help`

```
USAGE
  siyuan api <id> [options]
  siyuan api list [--group <glob>] [--tag <t>]
  siyuan api describe <id>

EXAMPLES
  siyuan api query.sql "SELECT id FROM blocks LIMIT 5"
  siyuan api block.appendBlock --parentID 2021... --data @file:./note.md
  siyuan api asset.upload --file[] ./image.png

GLOBAL OPTIONS
  --workspace <n>     临时切换 workspace
  --format <fmt>         json(默认) | pretty | yaml
  --debug                显示等价 curl 命令

Use `siyuan api list` to browse all endpoints.
Use `siyuan api <id> -h` for endpoint-specific help.
```

### 4.2 单 endpoint `siyuan api query.sql -h`

基于 schema 动态生成：

```
通过 SQL 查询思源数据库

USAGE
  siyuan api query.sql <stmt>
  siyuan api query.sql --stmt <value>
  siyuan api query.sql -j '<json>'
  siyuan api query.sql -f <file>
  siyuan api query.sql -i

ENDPOINT
  POST /api/query/sql
  Tags: read, query

PARAMETERS
  stmt  <string>  required  ← primary
        SQL 查询语句（仅 SELECT）

INPUT SOURCES
  stmt:   literal | file | stdin
          Use @file:<path>, @stdin (or -), or literal value

PAYLOAD MODES
  -j, --json <json>   直接传入 JSON payload
  -f, --file <path>   从文件读取 JSON payload（- 表示 stdin）
  -i, --interactive   启动 $EDITOR 编辑 payload

EXAMPLES
  siyuan api query.sql "SELECT id,content FROM blocks WHERE type='d' LIMIT 5"
      列出前 5 个文档块
  siyuan api query.sql --stmt @file:./query.sql
      从文件读取 SQL
  cat query.sql | siyuan api query.sql --stmt @stdin
      从 stdin 读取 SQL

OUTPUT
  与 kernel API 的 JSON response 完全一致
  成功：{"code":0,"msg":"","data":[...]}
  失败：{"code":<非 0>,"msg":"<错误信息>","data":null}

详细描述：
  执行任意只读 SQL。可用表参考 skills/siyuan-cli/references/sql-cheatsheet.md。
  注意：虽然内核允许 write 操作，但本 CLI 的权限层默认只放行 SELECT。
```

### 4.3 `siyuan api list`

```
siyuan api list                          # 全部
siyuan api list --group query            # query.*
siyuan api list --group "block.*"        # 同上风格
siyuan api list --tag read               # 仅 read tag
siyuan api list --format json            # 机器读
```

JSON 输出：

```json
[
  {"id":"query.sql","endpoint":"/api/query/sql","summary":"通过 SQL 查询思源数据库","tags":["read","query"]},
  {"id":"block.appendBlock","endpoint":"/api/block/appendBlock","summary":"在文档或块的末尾追加内容","tags":["write","mutation"]}
]
```

### 4.4 `siyuan api describe <id>`

输出整个 EndpointSchema 的 JSON —— 给 MCP server、IDE、Agent skill 机器消费。

## 5. 启用 / 禁用机制

### 5.1 配置（见 03-module-workspace.md §1.1）

- `disabled: ["export.*"]` → 禁用 `export.*` 所有 endpoint
- `disabled: ["system.exit"]` → 只禁用这一个
- `enabled: [...]`（存在时）→ 白名单模式，只有命中才可用
- 匹配算法：用派生 id（如 `query.sql`），micromatch 标准 glob

### 5.2 运行时检查

```ts
function checkEndpointEnabled(id: string, perm: PermissionConfig): void {
  if (perm.api?.enabled?.length) {
    if (!micromatch.isMatch(id, perm.api.enabled)) {
      throw new EndpointDisabledError(id, "not in allow list");
    }
  }
  if (perm.api?.disabled?.length && micromatch.isMatch(id, perm.api.disabled)) {
    throw new EndpointDisabledError(id, "in deny list");
  }
}
```

## 6. 请求执行

```ts
async function executeEndpoint(
  schema: EndpointSchema,
  payload: unknown,
  ctx: { client: SiyuanClient; perm: PermissionEngine; args: GlobalArgs }
): Promise<unknown> {
  // 1. endpoint 级别权限
  ctx.perm.checkEndpoint(deriveId(schema.endpoint));

  // 2. payload guard（见 07）：扫描 payload 中声明的 id/path/notebook 字段，checkDeny
  applyPayloadGuard(schema, payload, ctx.perm);

  // 3. 写保护
  if (ctx.perm.requiresConfirmation(schema) && !ctx.args.yes && !ctx.args.dryRun) {
    throw new ConfirmationRequiredError(schema);
  }

  // 4. dry-run
  if (ctx.args.dryRun) {
    return { dryRun: true, endpoint: schema.endpoint, payload };
  }

  // 5. 发送
  const response = schema.multipart
    ? await ctx.client.upload(schema.endpoint, extractFiles(payload, schema), extractFields(payload, schema))
    : await ctx.client.call(schema.endpoint, payload);

  // 6. response guard（见 07）：按 schema.guard.response 过滤
  return applyResponseGuard(schema, response, ctx.perm);
}
```

## 7. 错误处理

CLI exit code 约定：

| code | 含义 |
| --- | --- |
| 0 | 成功（kernel `response.code === 0`） |
| 1 | Kernel 返回非 0 code（业务错误） |
| 2 | 参数错误 / schema 验证失败 |
| 3 | 配置错误（无 workspace / token） |
| 4 | 权限拒绝 |
| 5 | 网络 / HTTP 错误 |
| 10 | 未知错误（bug） |

**stderr** 输出结构化错误（JSON），便于 Agent 解析：

```json
{"level":"error","code":"ENDPOINT_DISABLED","endpoint":"system.exit","message":"endpoint 'system.exit' is in deny list"}
```

**stdout** 始终只输出业务数据或空。

## 8. 一期要实现的 Endpoint 清单（最少）

| id | 原因 |
| --- | --- |
| `system.version` | verify 依赖 |
| `system.bootProgress` | Docker 场景有用 |
| `notebook.lsNotebooks` | 所有浏览依赖 |
| `notebook.createNotebook` | 常用 |
| `filetree.listDocsByPath` | 文档树 |
| `filetree.createDocWithMd` | 常用写 |
| `filetree.renameDocByID` | 常用写 |
| `filetree.removeDocByID` | 常用写 |
| `filetree.getHPathByID` | id → 人类可读路径 |
| `block.getBlockKramdown` | 读块 |
| `block.getChildBlocks` | 读块 |
| `block.appendBlock` | 常用写 |
| `block.insertBlock` | 常用写 |
| `block.updateBlock` | 常用写 |
| `block.deleteBlock` | 常用写 |
| `attr.getBlockAttrs` | 读属性 |
| `attr.setBlockAttrs` | 写属性 |
| `query.sql` | 最高频 |
| `search.fullTextSearchBlock` | 搜索 |
| `export.exportMdContent` | 导出 |
| `asset.upload` | 上传（multipart 样板） |
| `notification.pushMsg` | 给用户推消息（Agent 友好） |

~= 22 个。骨架 `src/apis/` 预置 6 个作为参考模板，其余 Agent 按模板扩展即可。

## 9. Schema 迁移：从 siyuan-sdk 拷贝

`scripts/sync-sdk-schemas.ts`：

```
克隆 siyuan-community/siyuan-sdk 到 .cache/
对于每个 schemas/kernel/api/<group>/<n>/payload.schema.json：
  派生 endpoint = "/api/<group>/<n>"
  如果 src/apis/<group>/<n>.ts 不存在：
    生成骨架文件：
      endpoint 从路径推导
      payload 从 JSON schema 复制
      tags 根据 endpoint 推测（含 get/list/search → ["read"]，其他 → ["write"]）
      cli 字段留空占位
对于已存在的文件：
  只更新 payload schema 主体，保留 cli / tags / examples / guard
```

输出一份 diff 报告，人工 review 后 commit。

---

下一篇 `05-module-tool.md` 展开 Tool 模块。

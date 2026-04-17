# 02 · 整体架构

> 本篇要回答什么：技术栈用什么？如何分层？有哪些核心抽象？项目目录怎么摆？

## 1. 技术选型

### 1.1 语言 / 运行时：TypeScript + Node.js ≥ 20

**理由**：

| 维度 | Node.js (TS) | Go | Rust |
| --- | --- | --- | --- |
| 思源生态复用 | ✅ `siyuan-sdk` 现成，schema 可直接引用 | ❌ 需重写 | ❌ 需重写 |
| Agent 集成 | ✅ `npx @xxx/siyuan-cli` 零安装 | 🟡 单二进制但分发麻烦 | 🟡 需 `cargo install` |
| Schema 验证 | ✅ ajv / zod 成熟 | 🟡 gojsonschema | 🟡 jsonschema crate |
| 异步 IO | ✅ 原生 | ✅ 原生 | ✅ 原生 |
| 启动速度 | 🟡 ~200ms | ✅ ~10ms | ✅ ~10ms |

启动速度是 Node 的弱项，但对 Agent 用户来说 200ms 不敏感（单次对话通常只调用数次），换取 schema 复用和 npm 生态是划算的。

Node.js 20+ 有原生 `fetch`、原生 `--watch`、原生 Test Runner，减少依赖。

### 1.2 CLI 框架：Citty（首选） / Commander（备选）

**Citty** 来自 unjs 生态：

- 原生支持嵌套子命令、懒加载（启动快）
- TypeScript 类型友好
- 自定义 help formatter 简单
- 包小，无额外依赖

**Commander** 更成熟、社区大、文档多；但动态生成子命令（为每个 endpoint 注册 subcommand）需要额外处理。

**决策**：Citty 首选。如 Agent 觉得落地成本高，Commander 也可。

### 1.3 关键依赖清单

| 依赖 | 用途 | 必要性 |
| --- | --- | --- |
| `citty` | CLI 框架 | 必需 |
| `ajv` + `ajv-formats` | JSON Schema 验证 | 必需 |
| `yaml` | 配置文件解析 | 必需 |
| `consola` | 日志输出（支持 JSON 模式） | 推荐 |
| `defu` | 配置合并 | 推荐 |
| `pathe` | 跨平台路径 | 推荐 |
| `micromatch` | glob 模式（权限匹配 / API list 过滤） | 必需 |
| `pkg-types` | 读取 package.json | 可选 |

**不要引入** 的依赖：

- `axios`（用原生 fetch 即可）
- `chalk`（Node 20+ 有 `util.styleText`）
- `commander`（二选一，不要两个都装）
- 额外 Schema 转换工具（坚守 JSON Schema 单一真源）

### 1.4 构建 / 分发

- 构建：`tsdown`（基于 Rolldown，快）或 `tsup`
- 发布：`npm` 公共包 `@<scope>/siyuan-cli`（scope 由用户决定）
- 入口：`bin/siyuan.mjs` → 直接 `node --enable-source-maps dist/cli.mjs`

## 2. 分层架构

```
┌──────────────────────────────────────────────────────┐
│  CLI Layer                                           │
│  ├── commands/workspace  siyuan workspace ...        │
│  ├── commands/api        siyuan api <endpoint> ...   │
│  ├── commands/tool       siyuan tool <n> ...         │
│  └── commands/skill      siyuan skill ...            │
└─────────────────┬────────────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────────────┐
│  Argument Parser + Help Generator                    │
│  基于 EndpointSchema / ToolSchema 动态构造            │
│  支持来源前缀：@file:、@stdin、@env:                   │
└─────────────────┬────────────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────────────┐
│  Permission Engine                                   │
│  ├── checkEndpoint(id)   → endpoint 是否启用          │
│  ├── checkDeny({id,path,notebook}) → 单 item 是否允许 │
│  └── filterItems(list, extractor) → 批量过滤          │
└─────────────────┬────────────────────────────────────┘
                  │
┌─────────────────▼────────────────────────────────────┐
│  Core Runtime                                        │
│  ├── Registry      注册所有 Endpoint & Tool          │
│  ├── SiyuanClient  封装 HTTP 调用（含 multipart）    │
│  ├── Config        加载 / 写入 config.yaml           │
│  └── Formatter     JSON / YAML / Pretty              │
└─────────────────┬────────────────────────────────────┘
                  │ HTTP POST /api/...
┌─────────────────▼────────────────────────────────────┐
│  思源 Kernel (http://127.0.0.1:6806 or remote)       │
└──────────────────────────────────────────────────────┘
```

## 3. 核心抽象

### 3.1 `EndpointSchema`（Kernel API 的声明）

见 `04-module-api.md` 详细字段。核心要点：

```ts
interface EndpointSchema {
  // ——— 身份（唯一权威字段） ———
  endpoint: string;              // "/api/query/sql"
  // id / group / name 均由 loader 派生：
  //   endpoint "/api/query/sql" → id "query.sql", group "query", name "sql"

  // ——— 描述 ———
  summary: string;
  description?: string;

  // ——— 请求 payload（JSON Schema 子集） ———
  payload: JSONSchema;

  // ——— 响应（可选，仅用于 --describe） ———
  response?: JSONSchema;

  // ——— 元数据 ———
  tags?: EndpointTag[];           // ["read" | "write" | "mutation" | "dangerous" | "upload"]
  minKernelVersion?: string;
  deprecated?: { replacement?: string; reason?: string };

  // ——— 上传 ———
  multipart?: { fileFields: string[] };

  // ——— CLI 行为 ———
  cli?: {
    primary?: string;                                    // 哪个字段可作为位置参数
    examples?: Array<{ command: string; description?: string }>;
    aliases?: Record<string, string>;                    // { stmt: "s" }
    allowSource?: Record<string, InputSource[]>;         // { data: ["literal","file","stdin"] }
  };

  // ——— 权限 guard（声明式） ———
  guard?: {
    payload?: Record<string, GuardFieldKind>;            // payload 字段 → id/path/notebook
    response?: {
      itemsAt?: string;                                  // 极简 jsonpath: "data[*]"
      fieldMap?: Record<GuardFieldKind, string>;
    };
    filterResponse?: (response, checkDeny) => any;       // 命令式 hook 兜底
  };
}

type InputSource = "literal" | "file" | "stdin" | "env";
type GuardFieldKind = "id" | "path" | "notebook";
```

### 3.2 `ToolSchema`（业务 Tool 的声明）

```ts
interface ToolSchema {
  id: string;                         // kebab-case: "list-doc-tree"
  summary: string;
  description?: string;
  tags?: ToolTag[];

  input: JSONSchema;
  output?: JSONSchema;                // 文档用，不做运行时校验

  cli?: {
    primary?: string;
    examples?: Array<{ command: string; description?: string }>;
    aliases?: Record<string, string>;
    allowSource?: Record<string, InputSource[]>;
  };

  // 实现体 —— 约定返回 { content, details }
  run: (ctx: ToolContext, input: unknown) => Promise<ToolResult>;
}

interface ToolResult {
  content: string;                   // 面向阅读
  details?: unknown;                 // 结构化（可选）
  warnings?: string[];
}

interface ToolContext {
  client: SiyuanClient;
  registry: Registry;
  permission: PermissionEngine;
  callEndpoint: (id: string, payload: unknown) => Promise<unknown>;
  logger: Logger;
  args: GlobalArgs;
}
```

**关键约束**：Tool 调用 kernel API 必须走 `ctx.callEndpoint(id, payload)`，内部自动走权限引擎。不能绕过直接用 `client.call`（除非 Tool 显式不接受过滤，需在 `ToolContext` 中开后门 `callEndpointRaw`，慎用）。

### 3.3 `Registry`

统一注册中心，启动时扫描 `apis/**` 与 `tools/**` 并注册：

```ts
class Registry {
  private endpoints = new Map<string, EndpointSchema>();  // key: 派生 id "query.sql"
  private tools = new Map<string, ToolSchema>();          // key: tool.id

  registerEndpoint(schema: EndpointSchema): void;          // 派生 id 并注册
  registerTool(schema: ToolSchema): void;

  getEndpoint(id: string): EndpointSchema | undefined;
  getTool(id: string): ToolSchema | undefined;

  listEndpoints(glob?: string, tag?: string): EndpointSchema[];
  listTools(glob?: string, tag?: string): ToolSchema[];
}
```

### 3.4 `SiyuanClient`

```ts
class SiyuanClient {
  constructor(private config: { baseUrl: string; token?: string; timeoutMs?: number });

  async call(endpoint: string, payload: unknown): Promise<unknown>;
  async upload(endpoint: string, files, fields?): Promise<unknown>;
  async ping(): Promise<{ ok: boolean; version?: string; message?: string }>;
}
```

思源所有 API 都是 `POST /api/xxx` + `Authorization: Token xxx` + `Content-Type: application/json`（见 `references/siyuan-api-groups.md`），封装简单。

### 3.5 `PermissionEngine`

见 `07-module-permission.md` 完整设计。核心接口：

```ts
interface PermissionEngine {
  // 请求前：endpoint 是否启用（glob 白/黑名单）
  checkEndpoint(id: string): void;

  // 单项检查（Tool 和 API guard 都调用它）
  checkDeny(item: { id?: string; path?: string; notebook?: string }): { allowed: boolean; reason?: string };

  // 批量过滤（API guard 响应阶段用）
  filterItems<T>(items: T[], extract: (item: T) => { id?: string; path?: string; notebook?: string }): { kept: T[]; removed: number };

  // 写保护：返回 true 表示要求 --yes 确认
  requiresConfirmation(endpoint: EndpointSchema): boolean;
}
```

## 4. 目录结构（落库建议）

```
siyuan-cli/
├── package.json
├── tsconfig.json
├── README.md
├── bin/
│   └── siyuan.mjs                  # 入口 shebang
├── src/
│   ├── cli.ts                      # 主入口
│   ├── commands/
│   │   ├── workspace.ts
│   │   ├── api.ts
│   │   ├── tool.ts
│   │   ├── skill.ts
│   │   └── index.ts
│   ├── core/
│   │   ├── schema.ts               # EndpointSchema/ToolSchema 类型
│   │   ├── config.ts               # 读写 config.yaml
│   │   ├── registry.ts             # 注册中心 + id 派生
│   │   ├── client.ts               # SiyuanClient
│   │   ├── permission.ts           # PermissionEngine
│   │   ├── formatter.ts            # 输出格式化
│   │   ├── help.ts                 # 自定义 help 生成器
│   │   └── argv.ts                 # argv → payload 映射（含 @file:/@stdin/@env:）
│   ├── apis/                       # 每个 API 一个 schema 文件
│   │   ├── _index.ts               # 自动扫描并 re-export
│   │   ├── system/version.ts
│   │   ├── system/bootProgress.ts
│   │   ├── query/sql.ts
│   │   ├── notebook/lsNotebooks.ts
│   │   ├── block/appendBlock.ts
│   │   ├── block/getBlockKramdown.ts
│   │   ├── filetree/listDocsByPath.ts
│   │   ├── asset/upload.ts
│   │   └── notification/pushMsg.ts
│   ├── tools/
│   │   ├── _index.ts
│   │   ├── list-doc-tree.ts
│   │   ├── list-dailynote.ts
│   │   ├── append-content.ts
│   │   ├── create-doc.ts
│   │   └── resolve-path.ts         # hpath → path 解析助手（新增）
│   └── utils/
│       ├── paths.ts                # XDG config dir 解析
│       ├── input.ts                # @file: / @stdin / @env: 读取
│       ├── id.ts                   # 思源 ID 校验（14+7 格式）
│       └── errors.ts
├── skills/
│   └── siyuan-cli/
│       ├── SKILL.md
│       └── references/
│           ├── sql-cheatsheet.md
│           ├── block-types.md
│           └── common-workflows.md
├── tests/
└── scripts/
    ├── sync-sdk-schemas.ts         # 从 siyuan-sdk 同步 schemas
    └── gen-help-snapshot.ts        # 生成 --help 快照用于测试
```

## 5. 命令一览

```
# 工作空间
siyuan workspace add <n> --url <url> [--token <token>]
siyuan workspace list
siyuan workspace use <n>
siyuan workspace verify [<n>] [--all]
siyuan workspace show [<n>] [--reveal-token]
siyuan workspace remove <n>

# API 透传
siyuan api <id> [positional primary | --key value | -j/--json | -f/--file | -i/--interactive]
siyuan api list [--group <glob>] [--tag <t>]
siyuan api describe <id>

# Tool
siyuan tool <n> [flags...]           # 默认输出 content
siyuan tool <n> --details            # 输出 { content, details }
siyuan tool <n> --only details       # 只输出 details（便于 jq）
siyuan tool list [--tag <t>]
siyuan tool describe <n>

# Skill
siyuan skill list
siyuan skill read <n> [--files]
siyuan skill install <n> [--target agents|claude|claude-project|cursor|custom] [--dest <path>]

# 全局 flag
--workspace <n>
--baseUrl <url>
--token <token>
--format <json|pretty|yaml>
--debug                              # 打印 curl 等价请求
--dry-run                            # 写操作仅预览
--config <path>                      # 替代默认 config.yaml
--yes                                # 跳过写操作二次确认
```

## 6. 启动流程

```
main():
  1. parseArgv(process.argv)                 第一层：识别 global flag 和 top-level command
  2. loadConfig(flags.config)
  3. resolveWorkspace(flags, config, env)
  4. buildRegistry()                         扫描 apis/ 和 tools/，派生 id 注册 schema
  5. buildPermission(workspace.permission)
  6. buildClient(workspace)
  7. dispatch(command, args)                 交给对应 command handler
  8. formatter.output(result)                根据 --format 输出
  9. process.exit(0 | errCode)
```

## 7. 跨平台注意事项

- **路径**：必须用 `pathe`，不要混用 `\` 和 `/`
- **home**：Windows 用 `%APPDATA%`，其他平台用 `XDG_CONFIG_HOME ?? ~/.config`
- **stdin**：Windows PowerShell 的管道行为与 bash 不同，需测试 `| siyuan api query.sql --stmt @stdin`
- **文件权限**：Windows 上 chmod 0600 是 noop，但也不应报错

---

下一篇 `03-module-workspace.md` 展开 workspace 模块。

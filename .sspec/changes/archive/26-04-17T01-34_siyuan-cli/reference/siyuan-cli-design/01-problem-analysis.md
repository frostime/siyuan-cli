# 01 · 问题梳理与设计原则

> 本篇要回答什么：用户到底在造什么？为谁造？哪些表述是目标，哪些是"看似需求但其实是实现手段"？设计原则从哪里来？

## 1. 项目定位

**一句话**：给 Agent（而非人类终端用户）使用的思源笔记 CLI。

这是关键定性。它决定了后续的所有权衡：

| 对比项 | 面向人类的 CLI | 面向 Agent 的 CLI（本项目） |
| --- | --- | --- |
| 默认输出 | 带高亮表格、进度条 | 机器可解析的 JSON / Agent 友好的文本 |
| `--help` | 简洁美观，假设用户会看文档 | 结构化、信息密集、自包含，"看 `-h` 即可上手" |
| 交互提示 | 支持 `prompt` / TUI | 默认禁用交互，所有输入都可通过 flag / 文件 / stdin 传入 |
| 错误 | 友好提示 | 稳定的 exit code + 结构化 stderr JSON |
| 幂等性 | 不重要 | 非常重要（Agent 可能重试） |

所以 **首要设计原则** 是：**每一个命令 `-h` 都必须自足可用**，并且 **输出必须是机器能直接消费的格式**。

## 2. 需求分解

### 2.1 认证 / 工作空间管理

**表象**：`siyuan workspace add/use/verify`。

**真实意图**：让同一份 CLI 可以同时对接多个思源内核实例（本地不同 workspace、局域网实例、Docker 实例）。每个实例有独立的 `baseUrl + token`。

**隐含约束**：

- Token 的安全性 —— 思源 Token 等于 workspace 读写权限，明文存盘需谨慎
- 每条命令都要允许 `--workspace <n>` 覆盖当前活跃 workspace，Agent 需要并行操作多个
- `current` workspace 必须存在，否则大多数命令无法执行 —— 需优雅报错

**设计原则衍生**：

- 配置写入 `~/.config/siyuan-cli/config.yaml`（XDG 合规，Windows 回落 `%APPDATA%`）
- 优先级：`--workspace` flag > `$SIYUAN_CLI_WORKSPACE` 环境变量 > `current` 字段
- 文件权限 `0600`（Unix），保护 Token 不被其他进程读

### 2.2 Kernel API 直通

**表象**：`siyuan api query.sql "select ..."` 直接调用思源内核 API。

**真实意图**：思源 kernel 有 100+ 个 API，用户不想把它们一个个写成独立 CLI 命令；用户想要 **一个可扩展的"API 调度器"**，新 API 出现只需加 schema 文件。

**这里藏着一个关键设计：schema 驱动**。schema 承担三个职责：

1. 声明 endpoint 的 payload 字段（给 CLI 参数解析用）
2. 生成 `--help` 文本（field description 直接渲染）
3. 给 Agent 提供机器可读的接口描述（`siyuan api <id> --describe` 返回 JSON Schema）

**Schema 最小化原则**（v2 新增）：schema 只保留 `endpoint`（如 `/api/query/sql`），其余 `id`（`query.sql`）、`group`（`query`）、`name`（`sql`）均由 loader 从 `endpoint` 派生。避免人工维护两份真源错位。

### 2.3 Tool（高层封装）

**表象**：`siyuan tool list-doc-tree --entry <id>`。

**真实意图**：kernel API 粒度太细，Agent 完成一个业务操作可能要调 5 个 API；Tool 就是预封装这些常见组合，降低 Agent 的推理成本与 token 消耗。

**与 API 的边界**：

- **API**：1:1 透传内核 API，无业务逻辑
- **Tool**：n:m 组合 API，或在 API 之上做格式化、过滤、聚合

**输出契约**（v2 新增）：Tool 统一返回 `{ content: string, details: object }`。

- `content`：面向人类 / Agent 可直接阅读的 Markdown / 纯文本，默认只输出这个
- `details`：结构化 JSON，用 `--details` 或 `--only details` 才输出，可配合 `jq` 管道

### 2.4 Skill 管理

**表象**：`siyuan skill list/read/install`。

**真实意图**：把"如何使用这个 CLI"写成 Agent Skill 包（符合 Anthropic Agent Skills 标准），Agent 一条命令就能把 Skill 安装到本地 skill 目录，之后在对话中自动识别。

**Skill 不是 CLI 的配置，Skill 是 CLI 的"使用说明书"**，分发给 Agent 消费。

### 2.5 权限控制

**表象**：黑 / 白名单某些 API、notebook、path。

**真实意图**：给 Agent 设一道 **安全围栏**。Agent 出错 / 被 prompt injection / 幻觉生成破坏性操作时，CLI 层能兜底。

**三个维度**：

1. **API 级**：禁用某些 endpoint（如 `system.exit`、`export.*`、`file.removeFile`）
2. **内容级**（读写）：某些 notebook / path 不允许被操作
3. **结果过滤**：SQL 查询、搜索、文档树等返回结果中，凡命中黑名单 notebook / path 的条目都要被过滤掉 —— 否则 Agent 仍能"读到"受限内容

Path 语义（v2 修正）：配置里写 **思源 path**（形如 `/20260416161053-e4pj7ri/20260417090223-xxx.sy`），不用 hpath。理由：hpath 会重名、重命名后失效；path 基于 ID，稳定且唯一。详见 `07-module-permission.md`。

## 3. 识别出的 XY-Problem 与纠偏

### 3.1 "内部自行维护 schema" vs "复用 siyuan-sdk"

用户说"内部我们自行维护 api，每个 api 使用一个 schema 文件定义"，但也承认参考 `siyuan-community/siyuan-sdk`。

**实际做法**：

- siyuan-sdk 已维护完整的 **JSON Schema**（`schemas/kernel/api/**/*.schema.json`），覆盖 80%+ 常用 API
- 从零维护 100+ schema 是巨大重复劳动
- **一期**：直接引入 / 派生 siyuan-sdk 的 schemas 作为 base，在其基础上叠加 CLI 专属字段（`cli` 命名空间，如 `cli.primary`、`cli.examples`、`cli.allowSource`）
- **二期**：如 siyuan-sdk schema 滞后，再 fork / 自维护

这符合"自行维护"的精神（有自己的 schema 格式），但避免了重新造轮子。

### 3.2 "ts 的 IWorkspace 接口"是需求还是草稿

原 Reference 写了：

```ts
interface IWorkspace {
    schema: number;
    baseUrl: string;
    token?: string;
}
```

没有 `name` 字段。按常识 `name` 是主键。

**按常识处理**：workspace 必须有 `name`（唯一、用户可读）、`baseUrl`、可选 `token`、可选 `description`，以及一个全局 `schemaVersion`（用于未来配置迁移）。配置用 map 结构而非数组，name 即 key。详见 `03`。

### 3.3 "所有 CLI 输出 JSON" vs "对人友好"

这是隐含冲突：面向 Agent → JSON；但偶尔人类也会 `siyuan workspace list` 来看一眼。

**解法**：

- **默认 JSON**（stdout 第一字节是 `{` 或 `[`）
- `--format pretty` / `--format yaml` / `--format table` 可选
- **Tool 命令特殊处理**：默认输出 `content`（纯文本）而非整个 JSON，因为 content 本身就是可读的

## 4. 核心设计原则

按优先级：

1. **Agent-first**：所有默认值偏向机器消费；人类体验是锦上添花
2. **Schema-driven**：新增 endpoint / tool 只改 schema 文件，不改命令代码
3. **Schema 单一真源**：endpoint 字段是权威，其余字段一律派生；避免手工维护两份
4. **显式优于隐式**：输入源用 `@file:` / `@stdin` 明确标注，不用启发式猜
5. **可扩展性 > 初期完整性**：先把脚手架做扎实，API 覆盖度后续补
6. **安全兜底**：权限层是独立模块，默认保守（`system.exit`、`export.*` 默认禁用）
7. **可观察**：每次请求都可 `--debug` 打印 curl 等价命令，方便 Agent 和人排查
8. **零 side-effect 的读操作**：`list/query/get` 永远不写磁盘（除非 `--output file` 显式指定）
9. **幂等友好**：写操作接受 `--dry-run` 预览，写入冲突时明确报错而不是静默覆盖

这些原则在后续模块设计中反复出现，如果某个设计看起来与它冲突，就回来检查。

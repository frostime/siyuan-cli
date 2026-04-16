# siyuan-cli 预调研 & 架构设计

面向 **Agent 消费** 的思源笔记命令行工具设计包。收件方为本地 Agent —— 本包给出需求拆解、架构决策、骨架代码与参考素材，供 Agent 沿着同一条思路继续实现。

本版本（v2）已合入用户在评审中给出的 5 条修正意见：

1. workspace 的 `content.paths.deny` 使用思源 **path**（基于 ID，如 `/20260416161053-e4pj7ri/...sy`）而非 hpath
2. API schema 仅保留 **endpoint** 字段，`id` / `group` 由 loader 自动派生
3. 输入来源改为 **显式前缀 + allowSource 白名单**（`@file:<path>`、`@stdin`、`@env:VAR`），不再对字面值 `@` 做隐式解释
4. Tool 返回结构为 **`content`（可读文本）+ `details`（结构化）**，默认输出 content，需要时 `--details` 或 `--only details` 拿结构化
5. 权限过滤重写为 **规则 / 引擎 / 提取器** 三段论，支持声明式 guard、命令式 hook 与启发式兜底

## 阅读顺序

| 文件 | 目的 |
| --- | --- |
| `01-problem-analysis.md` | 拆解需求，识别隐含约束，明确设计原则 |
| `02-architecture.md` | 技术选型、分层、核心抽象、目录结构 |
| `03-module-workspace.md` | 多工作空间配置管理的细节设计 |
| `04-module-api.md` | API 直通层：Schema、argv → payload、`--help`、禁用策略 |
| `05-module-tool.md` | 高层 Tool：business 封装、content/details、输入来源 |
| `06-module-skill.md` | 内置 Skill 与 `skill install` 机制 |
| `07-module-permission.md` | 三段论安全过滤（rules / engine / extractor） |
| `08-roadmap.md` | MVP → v1.0 的里程碑 |
| `09-open-questions.md` | 尚未定调的问题，列出权衡等待拍板 |

`references/` 给 Agent 查阅的外部资料索引与摘录，`skeleton/` 存放可直接落库的项目骨架。

## 决策快照（TL;DR）

以下决策已定，Agent 按此执行无需再征询：

- **运行时**：TypeScript + Node.js ≥ 20（原生 `fetch`，npm/npx 分发）
- **CLI 框架**：Citty（unjs），Commander 备选
- **Schema 权威字段**：`endpoint`（如 `/api/query/sql`）；其余 `id`/`group`/`name` 一律派生
- **配置路径**：`~/.config/siyuan-cli/config.yaml`（Windows 回落 `%APPDATA%`）
- **glob 匹配格式**：派生 id 为 `<group>.<name>`（点号），配置里写 `query.*`、`export.*`
- **输出**：默认原始 JSON，支持 `--format pretty|yaml`
- **Tool 输出契约**：`{ content: string, details: object }`，默认只输 `content`
- **输入源标记**：`@file:<path>`、`@stdin`、`@env:<VAR>`；字面值 `@x` 原样传递
- **Skill 默认目录**：`~/.agents/skills/`，可 `--target claude` 切到 `~/.claude/skills/`
- **Path 语义**：配置里写思源 path（`/<notebookId>/<docId>.sy`），不用 hpath
- **权限架构**：规则（config）→ 引擎（checkDeny + filterItems）→ 提取器（schema guard / 命令式 hook / 启发式）

## 未决议（待拍板）

详见 `09-open-questions.md`，核心几个：

1. Token 落盘形态（默认明文 0600 vs keychain vs token_source）
2. 是否提供 TUI / 交互模式（当前倾向"只做 `$EDITOR` 回退"）
3. 用户自定义 Tool 加载安全性（v1.0 前先只接 bash alias）
4. 是否内置 SQL 速查表 / 块类型表作为 Skill references

## 给本地 Agent 的执行建议

1. 先通读 `01` 与 `02` 建立共识
2. 按 `skeleton/` 初始化项目，跑通 `workspace add/verify/use` 闭环（最小 MVP）
3. 按 `04` 实现 Registry + 动态 `siyuan api <endpoint>` —— 此时项目已可用
4. 叠加 `tool` / `skill` / `permission`
5. 每个里程碑生成 `--help` 文本快照作为测试基线，保证"看 `-h` 即可自学"

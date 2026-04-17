# 08 · Roadmap

> 本篇要回答什么：从零到 v1.0 分哪些里程碑？每个里程碑交付什么？测试标准是什么？

按"能够投入使用"的增量划分，每个里程碑结束后 CLI 都应该是可工作的子集。

## M0：骨架（week 0，半天）

**目标**：项目能 `npm install && npm run build`，`siyuan --version` 和 `siyuan --help` 有输出。

- [ ] `package.json`、`tsconfig.json`、`bin/siyuan.mjs`
- [ ] `src/cli.ts` 空壳，`citty` defineCommand 返回 `"hello"`
- [ ] 构建链路打通（tsdown / tsup）
- [ ] GitHub Actions CI：lint + build

**交付**：可发布的空壳 npm 包。

## M1：Workspace（week 1）

**目标**：`siyuan workspace add/list/use/verify/remove/show` 全部可用。

- [ ] `src/core/config.ts` 读写 `~/.config/siyuan-cli/config.yaml`
- [ ] `src/utils/paths.ts` 跨平台解析配置目录
- [ ] `src/core/client.ts` SiyuanClient（只实现 `call` 和 `ping`）
- [ ] `src/commands/workspace.ts` 完整命令
- [ ] Unix 下写入 chmod 0600
- [ ] 首次运行自动创建 default config

**测试**：

- 与实际思源实例对接（`http://127.0.0.1:6806`），`verify` 返回版本号
- 错误场景：ECONNREFUSED / 401 / 超时 分类型报错

**交付**：能跑通完整的配置闭环。

## M2：API 直通（week 2）

**目标**：`siyuan api <id>` 可用，动态 schema 注册，`--help` 基于 schema 生成。

- [ ] `src/core/schema.ts` 类型定义
- [ ] `src/core/registry.ts` 从 endpoint 派生 id，扫描注册
- [ ] `src/core/argv.ts` argv → payload 映射（支持 `@file:` / `@stdin` / `@env:` / `-j` / `-f`）
- [ ] `src/core/help.ts` 基于 schema 生成 `--help`
- [ ] `src/commands/api.ts`：`api list`、`api describe`、`api <id>`
- [ ] 预置 6 个 endpoint：`system.version`、`query.sql`、`notebook.lsNotebooks`、`block.appendBlock`、`block.getBlockKramdown`、`asset.upload`

**测试**：

- `siyuan api query.sql "SELECT 1"` 返回正确结果
- `siyuan api asset.upload --file[] ./test.png` 文件能上传成功
- `cat query.sql | siyuan api query.sql --stmt @stdin` 可用
- `siyuan api query.sql -h` 的输出匹配快照

**交付**：最小可用 CLI，覆盖 read-only 场景。

## M3：权限引擎（week 3）

**目标**：`permission` 模块三段论落地，启发式兜底生效。

- [ ] `src/core/permission.ts`：checkEndpoint / checkDeny / filterItems
- [ ] 极简 jsonpath 工具（`data[*]` / `data.blocks[*]`）
- [ ] 把预置 6 个 endpoint 加上 guard 声明
- [ ] 启发式 payload guard
- [ ] 写保护（guardWrite + --yes）

**测试**：

- 配 `paths.deny` 后，`siyuan api query.sql "SELECT ..."` 结果被过滤
- 配 `api.disabled: ["system.exit"]` 后，`siyuan api system.exit` 拒绝
- `siyuan api block.deleteBlock --id ...` 未加 `--yes` 时拒绝

**交付**：安全围栏可配置可验证。

## M4：Tool 层（week 4）

**目标**：Tool 框架就绪，4 个 MVP Tool 可用。

- [ ] `src/core/schema.ts` 扩展 ToolSchema
- [ ] `src/commands/tool.ts`：`tool list`、`tool describe`、`tool <n>`
- [ ] 输出契约：默认 content，`--details` / `--only details`
- [ ] 内置 Tool：`resolve-path`、`list-doc-tree`、`list-dailynote`、`append-content`、`create-doc`

**测试**：

- 所有 MVP Tool 的 `-h` 输出匹配快照
- `list-doc-tree` 的 content 可读、details 结构合理
- `append-content --markdown @stdin` 可用

**交付**：可配合 Agent 完成典型工作流。

## M5：Skill（week 5）

**目标**：Skill 可列 / 可读 / 可安装。

- [ ] `src/commands/skill.ts`：list / read / install / uninstall
- [ ] `skills/siyuan-cli/SKILL.md` 完整版（含前述命令矩阵、模板变量）
- [ ] `skills/siyuan-cli/references/`：sql-cheatsheet、block-types、common-workflows、error-codes
- [ ] 模板变量替换
- [ ] `--target agents/claude/cursor/custom` 支持

**测试**：

- `siyuan skill install siyuan-cli` 到临时目录，文件齐全
- SKILL.md frontmatter 合规（`name`、`description` 长度）
- 在 Claude Code 中加载，能识别 skill 并调用命令

**交付**：Agent 装完 Skill 即可会用 CLI。

## M6：补齐 API + 打磨（week 6）

**目标**：覆盖清单中的 22 个 endpoint。

- [ ] 补齐其余 16 个 endpoint schema
- [ ] `scripts/sync-sdk-schemas.ts`：从 siyuan-sdk 同步（可选）
- [ ] 完整的 error code 文档
- [ ] `--debug` 打印 curl 等价命令
- [ ] `--dry-run` 在所有写 endpoint 上生效

**测试**：

- 每个 endpoint 的 `-h` 快照
- 全量 smoke test（对接真实思源实例跑一遍核心 workflow）

**交付**：v0.9，对外邀请 early adopter。

## M7：稳定化 → v1.0（week 7–8）

**目标**：生产级质量。

- [ ] tokenSource（env / file / command）
- [ ] bash alias Tool（用户自定义工作流）
- [ ] 异常处理统一（所有错误 → 结构化 stderr JSON）
- [ ] 发版流程：changeset + GitHub Release
- [ ] README + examples 完整

**测试**：

- 全平台构建（macOS / Linux / Windows）
- 文档站点上线
- 至少 3 位外部用户试用反馈

**交付**：v1.0 稳定版。

## 非目标（post-1.0）

- 用户自定义 JS/TS Tool（动态加载安全性未解）
- TUI / 交互式 REPL（与 Agent-first 原则冲突）
- 思源 kernel 嵌入模式（CLI 本身启动内核）
- 多语言 i18n（一期只做中/英双语 --help）

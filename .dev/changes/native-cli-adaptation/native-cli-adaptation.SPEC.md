# siyuan-cli 应对原生 CLI/MCP 的方向调整

> 状态：N1、N2 已验收；实现完成，待提交与发布
> 创建：2026-08-09 · 本文件是调研与讨论的沉淀，供后续 change 引用

## 问题陈述

SiYuan v3.7.0（2026-06-30）起，思源官方在内核中内置了命令行接口（CLI）与 MCP server，本项目的存在前提受到直接冲击：

1. **全局命令冲突（已实证）**：Windows 安装器自动把内核目录加入 PATH，原生 `siyuan.exe` 与 @frostime/siyuan-cli 安装的全局 `siyuan` 命令抢占。本机实测 `where siyuan` 第一顺位已是原生二进制——已安装 siyuan-cli SKILL 的 agent 执行 `siyuan api/tool/doc/...` 会静默打到原生 CLI 并报"命令不存在"，体验直接断裂。
2. **定位威胁**：原生 CLI 覆盖了 siyuan-cli 大部分数据面操作（block/attr/search/sql/doc/notebook 等），且离线可用、零依赖、官方维护；原生 MCP server 让外部 agent 可直接连接思源。项目需要回答"我们还有什么不可替代的价值"。
3. **需要明确的后续路线**：改名、补能力、是否桥接原生 CLI——都需要在调研基础上定案并落地。

## 观察到的（调研结论）

### 原生 CLI（v3.7.3，Go/cobra，随内核分发）

- 24 个命令组：block/attr/notebook/document/dailynote/database/tag/bookmark/template/ref/outline/search/sql/export/import/inbox/repo/history/sync/asset/file/workspace/system/serve。
- **离线直连数据层**：无需启动思源即可操作（进程内加载 model 层，执行后 flush 退出）。
- **与运行中 kernel 可并存**（实测）：kernel serve 运行期间，CLI 写块 → HTTP API 立即可读，双向一致；但官方未承诺并发安全，存在内存态冲突窗口。
- 冷启动 ~0.36s（dev 空间 3.2 万块），随工作区规模增长。
- 安全约束：`sql` 强制只读（实测 UPDATE 被拒）、加密笔记本源码级拒绝、全局 `--dry-run`。
- 独有能力极薄：三轮收敛后仅剩 `file grep`（工作区内容正则搜索）、`serve`（无头启动内核）、`completion`（shell 补全）；其余全部是内核 HTTP API 的"换皮"（含语义搜索与资产内容搜索——v3.7.3 的 HTTP API 已有 `search/semanticSearchBlock` 与 `search/fullTextSearchAssetContent`）。

### 原生 MCP server（v3.7.0 即有，v3.7.3 为 32 工具）

- `POST /mcp`（Streamable HTTP + session），要求管理员角色 + token + 非只读。
- 工具覆盖全数据域 + `file`（工作区文件读写删）+ `sql` + `http_request`/`web_search`/`web_fetch`/`unzip` 等网络与文件工具。
- **没有任何权限/审批/过滤层**——拿到管理员 token 即全权。这正是 siyuan-cli 护城河的落点。

### siyuan-cli 不可替代的价值（现状）

- 权限护栏：规则引擎（endpoint/tool/action/notebook/path 级 deny/allow/approval）+ 风险自动分级 + 审批中心 + 响应过滤。
- 79 个 endpoint 的长尾代理（filetree 16/notification/network/convert/sqlite 等原生 CLI 未覆盖）。
- TS 扩展系统（自定义 endpoint/tool）、agent SKILL 安装、agent 向内置文档。
- 多工作区管理（URL+token，支持远程 kernel）、@file/@stdin/@env 输入源等 agent 人体工学。

### v3.7.0 起新增的重要 API（以 CHANGELOG 为准）

- v3.7.0：AI Agent 群（`ai/agent/*` 14 条 + `ai/listModels`/`ai/testModel` + `search/semanticSearchBlock`）、内核插件 RPC（`plugin/rpc` 等）、密钥与变量（`setting/setSecrets`/`setVariables`）、跨文档撤销（`transactions/undo|redo|clearHistory|undoState`）、数据快照文件名搜索（`repo/searchRepoFile`/`exportRepoFile`）、`lute/md2html`、`history/createDocHistory`、`query/sql` 只读模式（`mode=readonly`）、LocalStorage API 改进；破坏性变更：移除 `system/reloadUI` 与 `filetree/refreshFiletree`、`av/setAttributeViewBlockAttr` 的 rowID→itemID、`rollbackDocHistory` 移除 notebook 参数、`updateTransaction`→`updateTransactionElement`。
- v3.7.1/v3.7.2：无 API 新增（changelog 层面）。
- v3.7.3：Obsidian Vault 导入群（`import/startObsidianVaultAnalysis` 等 8 条）；未宣传但路由新增：加密笔记本 API 群（10 条）、AI embedding 管理（`ai/embeddingStat` 等 5 条）、MCP OAuth（`ai/mcpOAuthAuthorize` 等 4 条）。

### 文档级检查点：`history/createDocHistory`（用户关注点）

- 来源：issue #17774（"AI 修改文档前先固定生成一次历史"），v3.7.0 实现，Milestone 3.7.0。
- 行为：`POST /api/history/createDocHistory {id}` → 拷贝该文档 .sy（含内嵌属性视图）到 `history/<时间戳>-op/` 目录；回滚用 `POST /api/history/rollbackDocHistory {historyPath}`。
- 与全仓快照 `repo/createSnapshot`（git-like 全量、需数据仓库 key、云同步时触发上传）相比：**文档级、无前置、纯本地、无云端副作用**——更适合做"AI 安全编辑"的检查点底座。
- 原生 CLI 未封装该命令；siyuan-cli 也未封装 history 组端点。
- 参考：内核 SiYuan Agent 的自动快照机制（写操作前打全仓快照、失败中止、每轮最多一次，`kernel/agent/agent.go`）。

## 需求（已与用户对齐的方向）

1. **现有 api 底座保持稳定**：现有 `api <endpoint>` 命令面（79 endpoint + guard 链）不因原生 CLI 出现而被替换；N1 只调整规范入口，N2 仅按既有注册和 guard 机制追加 `history.createDocHistory`。
2. **建立无歧义的规范命令，同时保留旧环境兼容**：全局新增 `siyuan-cli`，作为本项目唯一写入 SKILL、内置文档、README、帮助和错误提示的规范命令；同时继续发布 `siyuan` 作为旧版兼容别名。兼容对象是 SiYuan `<3.7.0` 环境和既有 siyuan-cli 调用方，不是 npm 上其他同名或近似名称的包。SiYuan `>=3.7.0` 环境中，`siyuan` 可能由官方原生 CLI 或本项目提供，实际解析结果取决于 PATH，因此本项目在这些环境中只保证 `siyuan-cli` 无歧义可用。
3. **将 `checkpoint-doc` 升级为统一的文档检查点**：调用方只表达“为该文档创建恢复检查点”，不负责协调底层机制。SiYuan `>=3.7.0` 时，同一次调用必须尝试创建 SiYuan 内部文档历史和现有本地恢复包；SiYuan `<3.7.0` 时保留本地恢复包并明确提示内部 history 不可用。
4. **显式打点，不在 `brute-edit` 中隐式重复创建**：Agent 在一组高风险编辑开始前显式调用一次 `checkpoint-doc`。CLI 不引入跨进程“编辑周期”状态，不用时间窗口猜测是否已经打点，也不自动猜测历史路径或回滚。
5. **暴露最小的 history API**：N2 封装 `history.createDocHistory`，声明最低 kernel 版本 `3.7.0`，并让既有 `EndpointSchema.minKernelVersion` 在执行和帮助中真正生效。完整历史搜索、读取、回滚 API 不在本节点范围内，除非未来明确要求 Agent 直接完成恢复流程。
6. **不集成 native search/grep/backend**：评估结论是原生 `search` 与现有 HTTP API 高度重叠，`file grep` 的新增价值主要是低频原始文件诊断，但会引入本地 workspace 限制、二进制定位、权限过滤、approval 和跨平台路径成本，当前收益不足。本 change 不实现 native backend、原生 search/grep 或 serve 管理。
7. **两阶段交付**：
   - N1（最小可用要求，已验收）：新增规范命令 `siyuan-cli`，保留 `siyuan` 兼容别名，并完成 SKILL、文档、帮助、迁移说明和兼容验证。
   - N2（文档检查点升级）：封装 `history.createDocHistory`，使 `checkpoint-doc` 统一创建当前版本可用的恢复材料，并完成版本兼容、权限、失败语义、文档和测试。

## 行为契约（预期用户可见结果）

- 安装新版本后，`siyuan-cli api/tool/doc/skill/workspace/approval/extension` 是无歧义的规范入口，命令结构与参数保持不变。
- 在未内置官方原生 CLI 的 SiYuan `<3.7.0` 环境中，既有 `siyuan ...` 调用仍可通过兼容别名使用本项目；`siyuan-cli ...` 同样可用。
- 在 SiYuan `>=3.7.0` 环境中，本项目保证 `siyuan-cli ...` 调用本项目；裸命令 `siyuan ...` 由 PATH 顺序决定，可能调用官方原生 CLI，也可能调用本项目，不作为可靠入口。
- 升级按 breaking change 发布，发布说明与文档提供迁移指引；已安装 SKILL 的 agent 通过重新 `skill install` 获得 `siyuan-cli` 命令引用。
- N1 完成即满足本次调整的最小可用要求，可以独立发布；N2 不阻塞 N1。
- `siyuan-cli api history.createDocHistory --id <doc-id>` 在 SiYuan `>=3.7.0` 时创建内部文档历史并受既有 endpoint、tool、action、notebook 和 path 权限规则约束；低版本在调用 kernel 前返回明确的 unsupported-version 错误。
- `siyuan-cli tool checkpoint-doc <doc-id>` 是 Agent 面向的统一检查点入口：`>=3.7.0` 时创建内部 history 与本地恢复包，`<3.7.0` 时成功创建本地恢复包并发出降级警告。
- `checkpoint-doc --dry-run` 不创建内部 history，也不写本地恢复包，只报告计划。
- `>=3.7.0` 时两层恢复材料中的任一层失败，都不能伪装成完整成功；命令必须明确报告 partial failure 和已经成功保留的材料。两种存储之间不承诺原子事务。
- `brute-edit` 行为保持不变，不隐式创建 history；文档和 SKILL 指导 Agent 在一组高风险编辑开始前显式调用一次 `checkpoint-doc`。
- N2 新增 endpoint 遵守现有 EndpointSchema 约定。`checkpoint-doc` 因会创建 kernel history，classification 必须保守地反映写入副作用。
- 本 change 不新增 native search、grep、backend、启动停止或内核进程管理能力。

## 实施决策

**已定**：
- api 面不动；命令入口调整是 N1 的唯一内容。
- 全局同时发布 `siyuan-cli` 与 `siyuan` 两个 bin；`siyuan-cli` 是规范入口，`siyuan` 仅承担旧环境和既有调用方兼容。
- SKILL、内置文档、README、CLI 帮助和错误提示统一使用 `siyuan-cli`，不继续传播有歧义的 `siyuan` 用法。
- 项目内开发命令继续使用 `pnpm run siyuan ...`，不受全局 bin 命名调整影响。
- 不考虑与 npm 上其他 `siyuan-cli`/`syc` 包的兼容或共存。
- N1 是最小可用交付，完成后独立验收和发布准备。
- N2 是一个完整 Agent 工作包，不再拆成 endpoint、tool 和文档子节点。
- `history.createDocHistory` 走现有 endpoint 注册与 guard 机制（`src/api/endpoints/history/createDocHistory.ts` + `index.ts` 注册），不建立平行 API 调用路径。
- 现有 `EndpointSchema.minKernelVersion` 是最低版本声明的 authored truth；N2 只实现使该既有字段生效所需的最小版本检查，不另建通用 capability framework。
- `checkpoint-doc` 对外保持一个意图完整的深模块；内部可以分离 kernel history 与本地恢复包实现，以便清楚处理兼容和 partial failure。
- `checkpoint-doc` 在 `<3.7.0` 的本地-only 结果属于预期兼容降级，不算失败；在 `>=3.7.0` 时缺失任一层属于 partial failure。
- `brute-edit` 不承担检查点去重、会话状态或自动回滚职责。
- native search/grep/backend 与 serve 生命周期管理不在本 change 范围内。

**未决（允许 N2 Agent 在不改变行为契约的前提下决定）**：
- 两层检查点的具体执行顺序和内部 helper 边界。
- partial failure 使用的具体错误类型和 details 结构；必须保留既有成功材料的可定位信息。
- 最低 kernel 版本在现有 help/list 输出中的最小清晰呈现方式。

## 验收标准

- [x] N1：隔离安装 package 后同时生成 `siyuan-cli` 与 `siyuan` 两个入口，二者在显式解析到本 package 时均可运行本项目全部子命令。
- [x] N1：SKILL、内置文档、README、CLI 帮助和错误提示中的用户命令统一为 `siyuan-cli`；仅迁移说明、兼容性说明和项目内 npm script 名 `siyuan` 可保留旧名称。
- [x] N1：验证 SiYuan `<3.7.0` 的兼容别名预期，以及 SiYuan `>=3.7.0` 环境中 `siyuan-cli` 不依赖裸 `siyuan` 的 PATH 顺序。
- [x] N1 已完成实现验收，无需等待 N2，即可安装、使用并准备发布。
- [ ] 发布阶段：确定版本号，并按 breaking command migration 发布 npm package。
- [x] N2：`history.createDocHistory` schema、注册、帮助、classification、payload guard 和最低版本声明正确；endpoint schema 与权限相关测试通过。
- [x] N2：直接调用 createDocHistory 时，kernel `<3.7.0` 在目标请求前返回结构化 unsupported-version 错误，`>=3.7.0` 正常执行。
- [x] N2：`checkpoint-doc` 在 `>=3.7.0` 的一次真实调用中创建内部 history 与本地恢复包；在 `<3.7.0` 时保留本地恢复包并输出明确降级 warning。
- [x] N2：dry-run 无写副作用；完整成功、兼容降级、history 失败、本地写入失败等路径均不会把 partial result 误报为完整成功；supported-kernel dry-run 同时验证 history endpoint 的 deny/approval preview。
- [x] N2：`brute-edit` 不产生隐式 history；SKILL 与编辑 recipe 明确“一组高风险编辑前显式 checkpoint 一次”。
- [x] N2：dev workspace 实测内部 history 与本地恢复包均创建成功。
- [x] N2：`pnpm run typecheck`、完整测试和构建通过；不新增 native search、grep、backend 或 serve 管理代码。
- [ ] 全程：`pnpm run siyuan --help`（项目内）与全局规范命令行为一致；CLI 内部文档保持英文。

## 术语表

| 术语 | 含义 |
|------|------|
| 原生 CLI | 思源内核自带的 `siyuan` 命令（Go/cobra），v3.7.0 起随桌面端/服务端分发 |
| 原生 MCP | 内核 HTTP 服务器上的 `POST /mcp` 端点，向外部 agent 暴露 32 个工具 |
| guard 链 | siyuan-cli 的请求执行链路：payload 校验 → 权限规则 → 审批 → kernel 调用 → 响应过滤（`src/api/guard.ts`） |
| endpoint | siyuan-cli 对单个 kernel HTTP API 的封装（EndpointSchema，`src/api/endpoints/`） |
| tool | siyuan-cli 的高层工作流（`src/tool/`），通过 ToolContext 调用 endpoint |
| N1/N2 | 顶层 Agent 工作包：最小可用的命令入口兼容改造 / 文档检查点升级 |
| 文档级检查点 | `checkpoint-doc` 表达的统一恢复意图；新版 SiYuan 中包含内部文档 history 与本地恢复包两层 |
| 本地恢复包 | 现有 `checkpoint-doc` 写到磁盘的 Kramdown、属性、引用关系和恢复说明 |
| 内部文档 history | SiYuan `history/createDocHistory` 在 workspace history 中保存的文档历史版本 |

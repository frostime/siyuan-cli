# siyuan-cli 应对原生 CLI/MCP 的方向调整

> 状态：草案（讨论共识已记录，具体实现待新 agent 承接）
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

1. **api 部分保持不变**：现有 `api <endpoint>` 命令面（79 endpoint + guard 链）是稳定底座；N1 只改变其规范入口名称，不改变 endpoint 结构、参数和执行链。
2. **建立无歧义的规范命令，同时保留旧环境兼容**：全局新增 `siyuan-cli`，作为本项目唯一写入 SKILL、内置文档、README、帮助和错误提示的规范命令；同时继续发布 `siyuan` 作为旧版兼容别名。兼容对象是 SiYuan `<3.7.0` 环境和既有 siyuan-cli 调用方，不是 npm 上其他同名或近似名称的包。SiYuan `>=3.7.0` 环境中，`siyuan` 可能由官方原生 CLI 或本项目提供，实际解析结果取决于 PATH，因此本项目在这些环境中只保证 `siyuan-cli` 无歧义可用。
3. **在最小可用改造之后继承新版原生 CLI 能力**：后续由同一个工作节点评估 SiYuan 原生 CLI 的最新能力，并选择 HTTP API、原生 CLI 子进程或二者组合来补充本项目的 tool 能力；backend 选择对调用方透明。能够通过 HTTP API 实现的能力优先走现有 guard 链。铁律：**写操作永不走 native**，因为 native 路径绕过 permission、approval 和响应过滤。
4. **版本门槛**：原生 CLI 补充能力只在确认 SiYuan 版本 `>=3.7.0` 时开放；SiYuan `<3.7.0` 继续使用本项目既有的 HTTP API 能力，不尝试调用不存在的官方原生 CLI。补充能力始终可在 `list/help` 中发现并标注最低版本，实际执行前检查版本，版本不足时返回明确的 unsupported-version 错误。N2 必须可靠定位官方原生二进制并检查其 `--version` 输出，不能盲目调用 PATH 中第一个 `siyuan`，因为该名称也可能解析到本项目的兼容别名。
5. **两阶段交付**：
   - N1（最小可用要求）：新增规范命令 `siyuan-cli`，保留 `siyuan` 兼容别名，并完成 SKILL、文档、帮助、迁移说明和兼容验证。N1 完成后即可独立发布，不等待后续能力整合。
   - N2（能力补充）：合并原 API 补全与 native backend 方向。首批关注文档级 history 能力，以及原生 CLI 相比现有 tool/API 面能够带来的实际补充；在同一节点内完成能力选择、API/native 路由、安全边界和必要的 tool 整合。
6. **不做 serve 管理**：本 change 不实现通过原生 CLI 启动、停止或管理 SiYuan 内核进程。

## 行为契约（预期用户可见结果）

- 安装新版本后，`siyuan-cli api/tool/doc/skill/workspace/approval/extension` 是无歧义的规范入口，命令结构与参数保持不变。
- 在未内置官方原生 CLI 的 SiYuan `<3.7.0` 环境中，既有 `siyuan ...` 调用仍可通过兼容别名使用本项目；`siyuan-cli ...` 同样可用。
- 在 SiYuan `>=3.7.0` 环境中，本项目保证 `siyuan-cli ...` 调用本项目；裸命令 `siyuan ...` 由 PATH 顺序决定，可能调用官方原生 CLI，也可能调用本项目，不作为可靠入口。
- 升级按 breaking change 发布，发布说明与文档提供迁移指引；已安装 SKILL 的 agent 通过重新 `skill install` 获得 `siyuan-cli` 命令引用。
- N1 完成即满足本次调整的最小可用要求，可以独立发布；N2 不阻塞 N1。
- N2 若纳入 history 能力，`siyuan-cli api history.createDocHistory --id <doc-id>` 可直接为单文档创建检查点并受既有权限规则约束；`checkpoint-doc`/`brute-edit` 如何使用它由 N2 统一确认。
- N2 中任何新增 endpoint 遵守现有 EndpointSchema 约定（payload 校验、classification 风险分级、响应过滤兼容）。
- N2 中任何原生 CLI 补充能力在 SiYuan `<3.7.0` 时保持关闭；能力仍可在 `list/help` 中发现并标注版本要求，执行时返回明确的 unsupported-version 错误；原有 HTTP API 命令不受影响。
- 本 change 不新增启动、停止或管理 SiYuan 内核进程的命令或 tool。

## 实施决策

**已定**：
- api 面不动；命令入口调整是 N1 的唯一内容。
- 全局同时发布 `siyuan-cli` 与 `siyuan` 两个 bin；`siyuan-cli` 是规范入口，`siyuan` 仅承担旧环境和既有调用方兼容。
- SKILL、内置文档、README、CLI 帮助和错误提示统一使用 `siyuan-cli`，不继续传播有歧义的 `siyuan` 用法。
- 项目内开发命令继续使用 `pnpm run siyuan ...`，不受全局 bin 命名调整影响。
- 不考虑与 npm 上其他 `siyuan-cli`/`syc` 包的兼容或共存。
- N1 是最小可用交付，完成后独立验收和发布准备。
- N2 将 API 补全、tool 整合和只读 native backend 作为一个完整 Agent 工作包，不再拆成多个顶层节点。
- N2 中的 endpoint 封装走现有注册机制（`src/api/endpoints/<group>/<name>.ts` + `index.ts` 注册）。
- 原生 CLI 能力必须先通过 SiYuan `>=3.7.0` 的执行时版本门槛；版本不足时明确报错，不动态隐藏命令或 tool。
- N2 必须区分官方原生 `siyuan` 与本项目 `siyuan` 兼容别名，不能直接信任 PATH 第一项。
- 写操作永不路由到 native。
- serve 生命周期管理不在本 change 范围内。

**未决（需用户决策）**：
- N2 具体继承哪些原生 CLI 能力，以及哪些能力通过 API 实现、哪些确需 native 子进程。
- 官方原生二进制的跨平台定位与消歧策略；版本检查使用原生二进制的 `--version` 输出。
- N2 首批 endpoint 清单与优先级。
- `checkpoint-doc`/`brute-edit` 接入 createDocHistory 的具体交互设计（自动打点是否需审批、与现有恢复材料机制的关系）。

## 验收标准

- [ ] N1：`npm i -g` 后同时生成 `siyuan-cli` 与 `siyuan` 两个入口，二者在没有官方原生 CLI 抢占时均可运行本项目全部子命令。
- [ ] N1：SKILL、内置文档、README、CLI 帮助和错误提示中的用户命令统一为 `siyuan-cli`；仅迁移说明、兼容性说明和项目内 `pnpm run siyuan ...` 可保留旧名称。
- [ ] N1：在 SiYuan `<3.7.0` 场景验证兼容别名预期；在 SiYuan `>=3.7.0` 场景验证 `siyuan-cli` 不受官方 `siyuan` 的 PATH 顺序影响；按 breaking change 发布。
- [ ] N1 完成后无需等待 N2，即可安装、使用并准备发布。
- [ ] N2：新增 endpoint 通过 `endpoint-schemas.test.ts` 类 schema 校验；`--help` 输出正确；权限规则/风险分级可作用于新端点（`--dry-run` 验证）；若纳入 history 能力，在 dev 空间实测创建与回滚。
- [ ] N2：原生补充能力在 `list/help` 中标注 SiYuan `>=3.7.0` 要求；版本不足时执行返回明确错误且不调用原生能力。
- [ ] N2：能区分官方原生二进制与本项目兼容别名；SiYuan `>=3.7.0` 时只有经过选择的只读能力可使用 native backend；所有写操作仍经过 HTTP API 与 guard 链。
- [ ] 全程：`pnpm run siyuan --help`（项目内）与全局规范命令行为一致；CLI 内部文档保持英文；不存在 serve 管理功能。

## 术语表

| 术语 | 含义 |
|------|------|
| 原生 CLI | 思源内核自带的 `siyuan` 命令（Go/cobra），v3.7.0 起随桌面端/服务端分发 |
| 原生 MCP | 内核 HTTP 服务器上的 `POST /mcp` 端点，向外部 agent 暴露 32 个工具 |
| guard 链 | siyuan-cli 的请求执行链路：payload 校验 → 权限规则 → 审批 → kernel 调用 → 响应过滤（`src/api/guard.ts`） |
| endpoint | siyuan-cli 对单个 kernel HTTP API 的封装（EndpointSchema，`src/api/endpoints/`） |
| tool | siyuan-cli 的高层工作流（`src/tool/`），通过 ToolContext 调用 endpoint |
| N1/N2 | 顶层 Agent 工作包：最小可用的命令入口兼容改造 / 新版原生 CLI 与 API 能力补充 |
| 文档级检查点 | 通过 `history/createDocHistory` 为单个文档创建历史版本，供 AI 编辑前打点、出错回滚 |
| native backend（草案） | 把原生 `siyuan` 命令作为子进程 backend 供 tool 调用（仅只读场景） |

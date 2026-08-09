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

1. **api 部分保持不变**：`siyuan api <endpoint>` 面（79 endpoint + guard 链）是稳定底座，不因本次调整而改动。
2. **更新全局 bin name**：解决与原生 `siyuan` 的命令冲突。breaking change，需要同步更新 SKILL、内置文档、package.json bin、README。旧 bin 不保留（PATH 冲突无解）。新名字待定（候选：`siyuan-cli` / `syc`，需检查 npm 全局命令占用）。
3. **原生 CLI 作为内部 backend（远期、可选）**：tool 层可基于 api 调用或原生 CLI 子进程（或其组合）实现功能，内部细节对用户透明。铁律：**写操作永不走 native**（native 路径绕过 permission/approval/响应过滤；只读能力如 `file grep`、离线场景才可走 native）。native 的价值集中在离线场景与独有能力，多数"补 tool 能力"的需求应优先走 API 封装。
4. **落地顺序**：
   - Phase 1：改名 + SKILL/docs/README/migration 更新（独立、低风险、优先做）。
   - Phase 2：补封装缺失端点。首选 `history.createDocHistory`/`rollbackDocHistory`/`getDocHistoryContent`（文档级检查点）；候选 `repo` 组（createSnapshot/getRepoSnapshots/diffRepoSnapshots/rollbackRepoSnapshotFile/searchRepoFile）、`query/sql` 的 `mode=readonly`（可作默认只读策略）、`transactions/undo|redo`（tool 安全编辑撤销）。新端点自动获得 guard 链（schema 校验 + 权限规则 + 风险分级）。
   - Phase 3：native backend 抽象（仅当确有离线/独有能力需求时启动；从只读能力起步）。
   - Phase 4（远期）：`serve` 管理（启动/停止内核）作为审批型 tool。

## 行为契约（预期用户可见结果）

- 安装新版本后，全局命令不再与原生 `siyuan` 冲突；`siyuan api/tool/doc/skill/workspace/approval/extension` 全部迁移到新命令名下，命令结构与参数不变。
- 升级为 breaking change（major bump），发布说明与文档提供迁移指引；已安装 SKILL 的 agent 通过重新 `skill install` 获得新命令引用。
- Phase 2 完成后：`<新命令> api history.createDocHistory --id <doc-id>` 可直接为单文档创建检查点，受既有权限规则约束；`checkpoint-doc`/`brute-edit` 等 tool 可基于它实现"编辑前自动打点、出错回滚"（内部细节对用户透明）。
- 任何新增 endpoint 遵守现有 EndpointSchema 约定（payload 校验、classification 风险分级、响应过滤兼容）。

## 实施决策

**已定**：
- api 面不动；改名是 Phase 1 的唯一内容。
- 旧 bin 名不保留兼容。
- Phase 2 端点封装走现有 endpoint 注册机制（`src/api/endpoints/<group>/<name>.ts` + `index.ts` 注册）。
- 若做 Phase 3，写操作永不路由到 native。

**未决（需用户决策）**：
- 新 bin 名最终选择。
- Phase 2 端点清单与优先级（本文档给出首选与候选，未排期）。
- Phase 3/Phase 4 是否启动、何时启动。
- `checkpoint-doc`/`brute-edit` 接入 createDocHistory 的具体交互设计（自动打点是否需审批、与现有恢复材料机制的关系）。

## 验收标准

- [ ] Phase 1：新 bin 名生效；`npm i -g` 后全局命令可运行全部子命令；SKILL 与内置文档中无残留旧命令引用（rg 扫描）；major bump 发布。
- [ ] Phase 2：新增 endpoint 通过 `endpoint-schemas.test.ts` 类 schema 校验；`--help` 输出正确；权限规则/风险分级可作用于新端点（`--dry-run` 验证）；dev 空间实测 createDocHistory 创建后 rollbackDocHistory 可回滚。
- [ ] 全程：`pnpm run siyuan --help`（项目内）与全局新命令行为一致；CLI 内部文档保持英文。

## 术语表

| 术语 | 含义 |
|------|------|
| 原生 CLI | 思源内核自带的 `siyuan` 命令（Go/cobra），v3.7.0 起随桌面端/服务端分发 |
| 原生 MCP | 内核 HTTP 服务器上的 `POST /mcp` 端点，向外部 agent 暴露 32 个工具 |
| guard 链 | siyuan-cli 的请求执行链路：payload 校验 → 权限规则 → 审批 → kernel 调用 → 响应过滤（`src/api/guard.ts`） |
| endpoint | siyuan-cli 对单个 kernel HTTP API 的封装（EndpointSchema，`src/api/endpoints/`） |
| tool | siyuan-cli 的高层工作流（`src/tool/`），通过 ToolContext 调用 endpoint |
| Phase 1/2/3/4 | 落地顺序：改名 / 补端点封装 / native backend / serve 管理 |
| 文档级检查点 | 通过 `history/createDocHistory` 为单个文档创建历史版本，供 AI 编辑前打点、出错回滚 |
| native backend（草案） | 把原生 `siyuan` 命令作为子进程 backend 供 tool 调用（仅只读场景） |

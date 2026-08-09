---
title: siyuan-cli 应对原生 CLI/MCP 的方向调研交接
created: 2026-08-09T15:13:04+08:00
---

# Handover：siyuan-cli 方向调研与讨论

## Assume Reader

接收者：新 session 的 pi agent，**没有**本会话上下文，但可以自行读取：
- `.dev/project.md` 与 `.dev/docs/`（项目知识）
- `.dev/changes/native-cli-adaptation/native-cli-adaptation.SPEC.md`（调研结论与需求，**主文档**，本文件不重复其内容）
- 代码仓库本身（`src/`、`skills/`、`src/docs/`）

本文件只补交接必要信息：调研轨迹、证据位置、未决问题、用户偏好。

## Background Context

SiYuan v3.7.0 起官方内置 CLI（`siyuan`，随内核分发，Windows 安装器自动加 PATH）与 MCP server（`POST /mcp`，32 工具）。用户发现本项目的全局 `siyuan` 命令被原生二进制抢占（本机实测 `where siyuan` 第一顺位是 `C:\Users\EEG\AppData\Local\Programs\SiYuan\resources\kernel\siyuan.exe`），且已安装 SKILL 的 agent 会静默打到原生 CLI 而报错。项目需要重新定位并落地调整。用户已提出三步方向（api 不变 / 改名 / native 作为内部 backend），并已对齐落地顺序（Phase 1 改名 → Phase 2 补端点 → Phase 3 native backend → Phase 4 serve 管理）。全部细节见 SPEC。

## Current Status

- 本会话为**纯调研与讨论，无任何 src/ 代码改动**。
- 已创建 change 目录 `.dev/changes/native-cli-adaptation/`，内含 SPEC（已写完）；本 Handover 与 MAP 待补（MAP 与 SPEC 同目录，未提交 git，当前 `git status` 仅显示未跟踪的 `.dev/changes/`）。
- 同分支另有已完成工作：`.sspec` → `.dev` 迁移（commit `a14a8ff`），改变了 change 文档存放规范（见 `.dev/changes/` 与 AGENTS.md）。新 agent 无需再处理迁移相关事项，但要注意：**不要再引用 `.sspec/` 路径**。
- 下一步（用户已明确）：把实现工作委托给新 agent，从 SPEC 承接。

## Trajectory

调研经历了六个阶段，逻辑层层递进，每阶段都有用户的质疑与修正：

**1. 原生 CLI 全貌摸底**（用户最初问题："项目何去何从"）。拉取全部子命令 help，在 dev 空间实测：离线可用（kernel 未启动时 sql/search 正常）、kernel 运行中也可用（`siyuan serve` 期间 CLI 写块 → HTTP API 立即可读，双向一致）、冷启动 0.36s、sql 强制只读、加密笔记本源码级拒绝（`rejectEncryptedNotebookCLI`）。同时确认原生 MCP：`POST /mcp`（Streamable HTTP+session，管理员角色+token），32 工具，无权限层。

**2. 功能对比与底层差别**。siyuan-cli 面：79 endpoint + 9 tool + workspace/doc/skill/approval/extension；原生面：24 命令组。底层：原生=进程内直调 kernel model 层（离线直通、无认证、无护栏）；siyuan-cli=HTTP+guard 链（校验→权限→审批→过滤）。性能量级相当。

**3. "非换皮功能"三轮收敛**（用户连续质疑推动）。第一轮凭印象说"语义/资产搜索是 CLI 独有"→ 用户指出后核对 v3.7.3 router.go，发现 API 已有 `search/semanticSearchBlock`/`fullTextSearchAssetContent`；第二轮路由差集列出 dailynote create 等 → 用户指出 `/api/filetree/createDailyNote` 存在（跨组前缀注册，差集方法有盲区）；第三轮按"API 组合可达性"重新判定 → 最终独有能力只剩 `file grep`/`serve`/`completion` + 三个行为约束（sql 只读、拒加密、--dry-run）。结论：原生 CLI 几乎 100% 是内核能力的命令行入口。

**4. 用户三步思路与评估**。用户提出：① api 部分不变 ② 更新 bin name ③ 把原生 CLI 作为内部 lib 补全 tool 能力（组合透明）。评估结论：①②成立；③可行但需修正预期——多数"补 tool 能力"需求（export data/repo/history/sync）走 API 封装更优（稳定+自动获得 guard），native 的价值集中在离线与只读独有能力；并立下铁律"**写操作永不走 native**"。产出落地顺序 Phase 1-4。

**5. file snapshot 排查**（用户线索："siyuan 宣传给 file 创建 snapshot"）。先找到全仓快照 `repo/createSnapshot`（= `model.IndexRepo`，SiYuan Agent 写操作前自动打点、失败中止、每轮一次，`kernel/agent/agent.go` L894）；用户澄清要文档级 → issue #17774 → 确认 `POST /api/history/createDocHistory {id}`（v3.7.0，拷贝 .sy+内嵌 AV 到 history 目录，回滚 `rollbackDocHistory`）。原生 CLI 与 siyuan-cli 均未封装该端点。

**6. v3.7.0 起新增 API 清单**（用户指示："直接查看 CHANGELOG；没写 changelog 的也不重要"）。拉取 v3.7.0~v3.7.3 官方 changelog 全文，整理出 AI Agent 群、内核插件、transactions 撤销、`history/createDocHistory`、`query/sql` readonly mode、Obsidian 导入群等；标注未宣传的（加密笔记本 API 群等）。

**分支工作**（用户提及但不需要新 agent 处理）：另一个分支完成了 `.sspec` → `.dev` 迁移，已合入 main（a14a8ff）。

## Key Information for the Successor

- **主文档**：`.dev/changes/native-cli-adaptation/native-cli-adaptation.SPEC.md`（问题/观察/需求/决策/验收，中文）。实现前先读它，未决问题需向用户确认。
- **未决问题**（SPEC"实施决策"节）：新 bin 名选择；Phase 2 端点清单优先级；Phase 3/4 是否启动；checkpoint-doc/brute-edit 接入 createDocHistory 的交互设计。
- **证据位置**（可复查，但注意 MSYS `/tmp` 即 `G:\Enviroment\msys2\tmp`）：
  - `/tmp/siyuan-src/` — 思源 master sparse clone（`kernel/{cli,api,model,agent,util}`），查原生实现的首选
  - `/tmp/router_v3.6.5.go`、`/tmp/router_v3.7.0.go`、`/tmp/router_373.go`、`/tmp/api_routes{,_365,_370,_373}.txt` — 各版本 API 路由表（v3.7.3 与 master 同 sha）
  - `/tmp/changelog_v3.7.{0,1,2,3}.md` — 官方 changelog 全文
- **实测环境**：dev 空间 `H:/Project_Active/SiYuanDevSpace`（约 3.2 万块；conf.json 在 `H:/Project_Active/SiYuanDevSpace/conf/conf.json`，内含 API token，勿外泄）。测试期间曾用 `siyuan -w <dev> serve --port 6806` 启动/关闭 kernel，已清理测试笔记本。
- **原生 CLI 行为速查**（实测值，新 agent 复测时对照）：`siyuan -w <path> sql "SELECT ..."` 0.36s；kernel 运行中写操作可用且 API 可见；`notebook create` 新建默认为 closed；MCP 调用需 `Mcp-Session-Id` 头（initialize 响应头返回）。
- **网络**：git clone github 需走代理 `http://127.0.0.1:10808`（`https_proxy` 环境变量）；gh api 未认证时有限流，可用 raw.githubusercontent 替代；web 检索用 `web-access` SKILL。
- **风险提示**：思源 master 演进快（v3.7.4-alpha/v3.8.0-alpha 已在路上），任何基于原生 CLI 行为的假设都要标注版本；路由 diff 注意跨组前缀注册（如 `filetree/createDailyNote`、`search/removeTemplate`）——判定"API 是否存在"必须全量路由表搜索，不能按前缀猜。

## File Reference Map

| 路径 | 用途 |
|------|------|
| `.dev/changes/native-cli-adaptation/native-cli-adaptation.SPEC.md` | 主文档：问题/观察/需求/决策/验收 |
| `.dev/changes/native-cli-adaptation/native-cli-adaptation.MAP.md` | 任务代码面索引（siyuan-cli 侧） |
| `.dev/changes/native-cli-adaptation/siyuan-upstream.MAP.md` | 思源上游内核源码导航（实证验证时用） |
| `.dev/project.md`、`.dev/docs/*.md` | 项目身份与知识（permission-model/endpoint-schema/error-model 等） |
| `src/api/endpoints/index.ts` + `src/api/endpoints/<group>/` | Phase 2 新增端点的注册模式样板 |
| `src/api/guard.ts`、`src/shared/schema.ts` | guard 链与 EndpointSchema 类型（新端点自动获得的能力） |
| `package.json`（bin 字段）、`bin/siyuan.mjs`、`skills/siyuan-cli/SKILL.md`、`src/docs/` | Phase 1 改名涉及面（rg 命中约 20 个文件） |
| `src/tool/registry.ts`、`src/tool/command.ts` | tool 层（checkpoint-doc/brute-edit 接入点） |
| `H:/SrcCode/开源项目/siyuan-dailynote-today/.dev/changes/` | change 文档格式参考（中文 SPEC 风格） |

## User Guidance

- 沟通用中文；CLI 内部文档与提示保持英文（项目规则）。
- 本项目内运行 CLI 用 `pnpm run siyuan ...`，不要用全局 `siyuan`（已被原生抢占，且可能是旧版本）。
- 测试必须用 dev 空间，禁止触碰用户主空间；若 dev 空间未启动，按项目规则应告知用户由其启动（本次调研为实测原生 CLI 曾自行启动/关闭 `siyuan serve`，用户未反对，但新 agent 尽量遵守规则）。
- 用户会质疑结论并要求实证：给结论要带源码/实测证据；被指出错误时快速修正并说明修正方法（本会话三轮收敛即由此推动）。
- 用户偏好"以官方 CHANGELOG 为准"来判断功能重要性；未写入 changelog 的功能按次要处理。

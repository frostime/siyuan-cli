---
title: siyuan-upstream Context Map
created: 2026-08-09
updated: 2026-08-09
---

# SiYuan 上游源码 Context Map

用途：极端情况下需要查看思源内核源码做**实证验证**时的导航索引。本 change 的主要依据是官方 CHANGELOG 与行为实测；仅当"API 是否存在/行为细节/实现差异"存疑时下钻到源码。

## 获取与更新

- 本地已有 sparse clone：`/tmp/siyuan-src`（MSYS `/tmp` = `G:\Enviroment\msys2\tmp`），已 checkout `kernel/{cli,api,model,agent,util,mcp}`。
- 重新获取（若 /tmp 被清理）：
  ```bash
  export https_proxy=http://127.0.0.1:10808 http_proxy=http://127.0.0.1:10808
  git clone --depth 1 --filter=blob:none --sparse https://github.com/siyuan-note/siyuan.git
  git sparse-checkout set kernel/cli kernel/api kernel/model kernel/agent kernel/util kernel/mcp
  ```
- 更新到最新：`git fetch --depth 1 && git sparse-checkout reapply`（或直接重拉）。
- **版本基线**：截至 2026-08-09，master 的 `kernel/api/router.go` 与 v3.7.3 tag 同 sha（1e7fa13）；本机安装的思源为 v3.7.3（`C:/Users/EEG/AppData/Local/Programs/SiYuan/resources/kernel/siyuan.exe`，可直接运行实测）。v3.7.4-alpha/v3.8.0-alpha 已在路上，**引用任何源码结论时标注版本**。

## 目录导航

| 目录 | 角色 | 何时进入 |
|------|------|---------|
| `kernel/api/router.go` | **路由注册中心**（647 行，547 条 `ginServer.Handle`） | 判断"某 API 是否存在"的第一站。⚠️ 端点可能挂在非直觉的组下（例：`filetree/createDailyNote`、`search/removeTemplate`）——必须全量搜索，不能按前缀猜 |
| `kernel/api/*.go`（54 文件） | HTTP API handler（按领域分文件：block/file/search/sql/repo/history/av/notebook/agent...） | 确认端点的参数/鉴权/行为 |
| `kernel/cli/cmd/`（26 文件） | 原生 CLI 命令实现（每命令组一个 .go，`Use:` 字段是命令名） | 确认 CLI 命令调用了哪个 model 函数 |
| `kernel/model/` | 内核业务层（被 api 与 cli 共同调用，是"换皮"判定的共同落点） | 确认功能真正实现 |
| `kernel/mcp/` | MCP server（`server.go` 的 `Serve` 注册 `/mcp`，不在 router.go）+ `tools/`（37 文件，32 个工具） | 确认 MCP 工具行为/鉴权 |
| `kernel/agent/` | SiYuan Agent（AI 对话、工具调用、自动快照） | 确认 agent 安全机制（如写前快照） |
| `kernel/util/` | 基础设施（工作区/路径/认证等） | 偶发需要 |

## 关键符号速查（实证验证常用）

| 问题 | 位置 |
|------|------|
| 某 API 是否注册？ | `kernel/api/router.go`（全量 grep `"/api/<group>/<name>"`） |
| `query/sql` 的 mode 参数 | `kernel/api/sql.go` 的 `SQL()` handler（默认可写；`mode=readonly` 才只读；CLI 侧 `kernel/cli/cmd/sql.go` 强制只读） |
| 文档级历史创建/回滚 | `kernel/api/history.go` `createDocHistory`（L265）/`rollbackDocHistory`（L179）→ `kernel/model/history.go:984` `CreateDocHistory`（拷贝 .sy+内嵌 AV 到 `history/<时间戳>-op/`） |
| 全仓快照 | `kernel/api/repo.go` `createSnapshot` → `kernel/model/repository.go:1583` `IndexRepo`（git-like 全量；需 `Conf.Repo.Key`；云同步时上传） |
| 语义搜索/资产内容搜索 | `kernel/api/search.go` `semanticSearchBlock`（L659）/`fullTextSearchAssetContent`（L123）→ `kernel/model/embedding.go:427`/`asset_content.go:117` |
| 文件 API 边界 | `kernel/api/file.go` `readDir`（**单层** `os.ReadDir` 不递归 + 加密路径拒绝 `rejectEncryptedBoxPath`）；`getFile` 单文件 base64 |
| MCP 端点的鉴权 | `kernel/mcp/server.go:28` `Serve`：`CheckAuth + CheckAdminRole + CheckReadonly`，Streamable HTTP + `Mcp-Session-Id` |
| MCP 工具清单 | `kernel/mcp/tools/`（工具名 = 文件名；`register.go` 是注册机制） |
| CLI 启动流程/加密拒绝 | `kernel/cli/cmd/root.go` `PersistentPreRunE`（workspace 解析、`model.InitConf`、SQL 库初始化）+ `rejectEncryptedNotebookCLI`（L126） |
| CLI 命令实现 | `kernel/cli/cmd/<group>.go`（例：`search.go` 的 `runAssetSearch` 调 `model.FullTextSearchAssetContent`） |
| Agent 自动快照 | `kernel/agent/agent.go` L894（`snapshotCreated` 每轮最多一次，失败中止操作）+ `needsLocalSnapshot`（L1157，仅本地写工具） |
| 工作区/路径工具 | `kernel/util/`（`IsWorkspaceDir`、`WorkspaceDir`、`DataDir`） |

## 实证验证方法（常见问题 → 路径）

1. **"这个功能 API 有没有？"** → `grep '"/api/' kernel/api/router.go` 全量匹配（跨组！）；再确认目标 tag 的 router.go（`raw.githubusercontent.com/siyuan-note/siyuan/<tag>/kernel/api/router.go`）。
2. **"原生 CLI 这个命令底层做什么？"** → `kernel/cli/cmd/<group>.go` 的 RunE 里找 `model.Xxx` 调用 → 去 `kernel/model/` 看实现。
3. **"CLI 与 API 实现是否等价？"** → 两者调用的 model 函数是否同一（API 路径多一层鉴权中间件，CLI 直调）。
4. **"MCP 工具的参数/行为？"** → `kernel/mcp/tools/<name>.go`（描述里含 actions 列表）。
5. **版本差异** → 用 raw.githubusercontent 拉指定 tag 的单个文件对比（gh api 未认证限流时优先 raw）。
6. **实测原生 CLI 行为** → 直接用本机 `siyuan`（dev 空间 `-w H:/Project_Active/SiYuanDevSpace`，kernel 未运行时离线可用）。

## Discovered Later

<!-- append-only -->
- v3.7.0 已有完整 `kernel/mcp`（32 工具）；v3.7.3 新增 `image`/`inbox` 工具
- 路由注册唯一例外：`/mcp` 在 `kernel/mcp/server.go` 自注册，不在 router.go

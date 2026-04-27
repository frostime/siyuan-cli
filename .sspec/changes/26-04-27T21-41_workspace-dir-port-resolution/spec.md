---
name: workspace-dir-port-resolution
status: REVIEW
change-type: single
created: 2026-04-27T21:41:37
reference: null
---

# workspace-dir-port-resolution

## Problem Statement

**现状**：SiYuan 多工作空间同时运行时，只有第一个绑定固定端口 6806；其余工作空间由内核在启动时随机分配端口。目前 `siyuan-cli` 的 `WorkspaceEntry` 仅接受 `baseUrl`（必须含端口），用户需手动追踪每个 workspace 的当前端口并维护在 `config.yaml` 中。

**需求**：提供另一种连接定位方式 — 按 workspace 磁盘目录自动发现端口，免去手动追踪。当用户知道工作空间在哪但不知道端口时，直接指定目录即可。

**约束**：此方式仅适用于本地 SiYuan 实例。远程连接仍依赖 `baseUrl`。

## Proposed Solution

### Approach

在 `WorkspaceEntry` 中新增可选字段 `workspaceDir`，与 `baseUrl` **并列**，用户二选一。当配置了 `workspaceDir` 且未提供 `baseUrl` 时，CLI 通过以下算法在运行时自动发现端口：

1. 向 `http://127.0.0.1:6806/api/system/getWorkspaces` 确认 SiYuan 进程活跃 → 获取全部 workspace 列表
2. 按目录名/完整路径匹配目标 workspace
3. 读取 `<workspaceDir>/conf/conf.json`，从 `serverAddrs` 解析本机端口
4. 向该端口发 `/api/system/getConf` 回查核验 `workspaceDir` 一致性
5. 结果写入内存缓存（TTL 60s）；缓存命中后**仍发轻量 verify 确认映射有效**，失效则自动重走完整解析

解析后的 `baseUrl` 注入 `ResolvedWorkspace`，对上层（`api`、`tool` 等）完全透明。

`baseUrl` 与 `workspaceDir` 同时提供时，`baseUrl` 优先（用户显式指定，不触发解析）。

### Key Change

- **Feat A: WorkspaceEntry 扩展** — 新增 `workspaceDir?: string`。`baseUrl` 和 `workspaceDir` 并列，至少提供一个。`baseUrl` 通用（本地/远程），`workspaceDir` 仅本地。
- **Feat B: 端口解析引擎** — 新增 `src/workspace/resolver.ts`：`resolveWorkspaceDirToBaseUrl(workspaceDir)` 含 5 步算法 + 缓存 + re-verify。
- **Feat C: Resolution 链集成** — 修改 `resolveWorkspace()`，`workspaceDir` 缺失 `baseUrl` 时自动调用解析引擎。
- **Feat D: CLI 注册支持** — `siyuan workspace add` 新增 `--workspace-dir <path>`。`show`/`verify`/`which` 透显示解析结果。
- **Feat E: 文档更新** — 配置格式文档、connect-workspace recipe、workspace-resolution 文档更新，反映 `workspaceDir` 并列关系。

### Scope Summary

| File | Change |
|------|--------|
| `src/workspace/resolver.ts` | **新增** 端口解析引擎 |
| `src/workspace/config.ts` | `WorkspaceEntry` 加 `workspaceDir`；`resolveWorkspace`/`resolveEffectiveWorkspace` → async + 集成 |
| `src/workspace/command.ts` | `add` 加 `--workspace-dir`；3 处 `resolveWorkspace` 加 `await` |
| `src/api/command.ts` | `resolveEffectiveWorkspace` 加 `await`（1 行） |
| `src/tool/registry.ts` | 同上（1 行） |
| `src/docs/cli-usage/config-and-permission.md` | 加 `workspaceDir` 配置说明 |
| `src/docs/cli-usage/cli-overview.md` | workspace add 参数更新 |
| `src/docs/recipes/connect-workspace.md` | 加 workspaceDir 使用方式 |
| `docs/extending/30-config.md` | 配置格式更新 |
| `docs/extending/31-workspace-resolution.md` | 解析逻辑更新 |
| `README.md` | 示例更新 |

### Design Reference

→ 详细技术设计见 [design.md](./design.md)

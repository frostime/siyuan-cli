---
change: workspace-dir-port-resolution
status: DOING
---

# Tasks

- [x] **T1** 新建 `src/workspace/resolver.ts` — 端口解析引擎（5-step + cache re-verify）
- [x] **T2** 修改 `src/workspace/config.ts` — `WorkspaceEntry` 加 `workspaceDir`；`resolveWorkspace`/`resolveEffectiveWorkspace` → async + 集成
- [x] **T3** 修改 `src/workspace/command.ts` — `add --workspace-dir`；3 处加 `await`
- [x] **T4** 修改 `src/api/command.ts` — `resolveEffectiveWorkspace` 加 `await`（1 行）
- [x] **T5** 修改 `src/tool/registry.ts` — 同上（1 行）
- [x] **T6** 更新文档 — `config-and-permission.md`、`cli-overview.md`、`connect-workspace.md`、`30-config.md`、`31-workspace-resolution.md`、`README.md`
- [x] **T7** 构建 & 测试 — `pnpm build` + `pnpm test`；57/57 pass
- [x] **T8** 更新 memory.md

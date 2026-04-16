# Memory · P1: Foundation

## State

DONE. 全部 11 tasks 完成，M0+M1 验证通过。等待 @align（review）。

## Key Files

- `reference/siyuan-cli-design/02-architecture.md` — 分层架构 + 目录结构（P1 落库的参照）
- `reference/siyuan-cli-design/03-module-workspace.md` — Workspace 模块详细设计
- `reference/siyuan-cli-design/skeleton/` — 可直接落库的骨架文件

## Knowledge

- [2026-04-17T01:36] [Constraint] `workspaces` 在 config.yaml 里用 map 结构（name 为 key），不用数组
- [2026-04-17T01:36] [Constraint] token 在输出中只显示 `hasToken: boolean`，除非 `--reveal-token`
- [2026-04-17T01:36] [Decision] 错误输出到 stderr，格式为结构化 JSON；exit code 1-5 分类型
- [2026-04-17T01:49] [Gotcha] commands/index.ts 未单独创建，workspace 命令直接在 cli.ts 中 import 注册，是合理简化
- [2026-04-17T01:49] [Gotcha] tsdown 0.5.x 与当前 rolldown 不兼容，已升级至 0.21.9；build script 需显式指定入口：`tsdown src/cli.ts --format esm --out-dir dist --no-dts`

## Milestones

- [2026-04-17T01:36] Design: spec.md + design.md 完成，等待 @align
- [2026-04-17T01:49] Implement: 全部 11 tasks 完成，pnpm build ✅，workspace 6 命令验证 ✅

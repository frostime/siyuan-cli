# Memory · P1: Foundation

## State

Design phase. spec.md + design.md 已完成。等待 @align gate 通过后进入 Plan → Implement。

## Key Files

- `reference/siyuan-cli-design/02-architecture.md` — 分层架构 + 目录结构（P1 落库的参照）
- `reference/siyuan-cli-design/03-module-workspace.md` — Workspace 模块详细设计
- `reference/siyuan-cli-design/skeleton/` — 可直接落库的骨架文件

## Knowledge

- [2026-04-17T01:36] [Constraint] `workspaces` 在 config.yaml 里用 map 结构（name 为 key），不用数组
- [2026-04-17T01:36] [Constraint] token 在输出中只显示 `hasToken: boolean`，除非 `--reveal-token`
- [2026-04-17T01:36] [Decision] 错误输出到 stderr，格式为结构化 JSON；exit code 1-5 分类型

## Milestones

- [2026-04-17T01:36] Design: spec.md + design.md 完成，等待 @align

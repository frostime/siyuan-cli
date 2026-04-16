# Memory · siyuan-cli (Root)

## State

P1 完成。P2 实现完成，进入 review。

## Key Files

- `reference/siyuan-cli-design/` — 完整预设计文档（9章 v2版），所有架构决策的原始出处
- `reference/siyuan-cli-design/skeleton/src/core/schema.ts` — 全局类型锚，P1 落库时直接复制

## Knowledge

- [2026-04-17T01:36] [Decision] 包名 `siyuan-cli`（无 scope），入口命令 `siyuan`
- [2026-04-17T01:36] [Decision] 未决议 Q1-Q9 全部采纳 reference/siyuan-cli-design/09-open-questions.md 的推荐方案
- [2026-04-17T01:36] [Decision] 设计文档 mv 至 root change reference/，spec/design 只写增量信息
- [2026-04-17T01:36] [Constraint] P1 的 SiyuanClient 接口冻结后 P2/P3 不得修改签名（破坏性变更需 @align）
- [2026-04-17T01:36] [Constraint] Tool 必须通过 ctx.callEndpoint 调用 kernel，不得绕过权限引擎
- [2026-04-17T02:08] [Decision] endpoint identity 始终以真实 kernel 为准；若 reference 设计文档与 SDK schema 冲突，实现以真实 endpoint 命名落库并写 revision
- [2026-04-17T02:08] [Decision] P2 中 filetree 写操作采用 `filetree.renameDoc` / `filetree.removeDoc`，对应替换 reference 中的 `renameDocByID` / `removeDocByID`
- [2026-04-17T02:25] [Decision] 为恢复 Agent-first 自发现体验，P2 的 `api` 命令改为动态 subcommands，并通过自定义 `showUsage` 恢复 `siyuan api <id> --help`

## Milestones

- [2026-04-17T01:49] Implement P1: 全部实现完成，M0+M1 验证通过，等待 review
- [2026-04-17T02:22] Implement P2: API layer + permission engine + 22 endpoint schemas 完成，等待 review

## Coordination

| Sub-change | Phase | Status | Deliverable |
|------------|-------|--------|-------------|
| 26-04-17T01-36_p1-foundation | P1: Foundation | 🚧 REVIEW | M0 骨架 + M1 Workspace 管理 |
| 26-04-17T01-57_p2-api-layer | P2: API Layer | 🚧 REVIEW | M2 API直通 + M3 权限引擎 |
| (TBD) | P3: Tool + Skill | ⏳ pending | M4 Tool层 + M5 Skill管理 |
| (TBD) | P4: Polish | ⏳ pending | M6 补齐API + M7 稳定化 |

# Memory · siyuan-cli (Root)

## State

P1、P2 已完成。P3 实现完成，进入 review。

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
- [2026-04-17T02:42] [Decision] 配置路径统一采用 `~/.config/siyuan-cli/config.yaml`，包括 Windows；`%APPDATA%` 仅保留为 legacy migration source

## Milestones

- [2026-04-17T01:49] Implement P1: 全部实现完成，M0+M1 验证通过，等待 review
- [2026-04-17T02:22] Implement P2: API layer + permission engine + 22 endpoint schemas 完成，等待 review
- [2026-04-17T02:29] Test P2: 尝试真实联调 `127.0.0.1:6806` 失败（timeout）；当前环境未发现该默认端口监听
- [2026-04-17T02:31] Test P2: 改用用户提供的 `127.0.0.1:5795` 成功完成真实联调，证明 `workspace verify`、`api system.version`、`api query.sql` 在真实思源内核上可用
- [2026-04-17T02:44] Review: 用户接受 P1/P2，phase 状态推进到 DONE，开始 P3
- [2026-04-17T11:58] Plan P3: 创建 `26-04-17T11-58_p3-tool-skill`，spec/design/tasks 已初始化
- [2026-04-17T12:15] Implement P3: tool runtime、4 个 MVP tools、skill runtime、builtin skill 内容完成，等待 review

## Coordination

| Sub-change | Phase | Status | Deliverable |
|------------|-------|--------|-------------|
| 26-04-17T01-36_p1-foundation | P1: Foundation | ✅ DONE | M0 骨架 + M1 Workspace 管理 |
| 26-04-17T01-57_p2-api-layer | P2: API Layer | ✅ DONE | M2 API直通 + M3 权限引擎 |
| 26-04-17T11-58_p3-tool-skill | P3: Tool + Skill | 🚧 REVIEW | M4 Tool层 + M5 Skill管理 |
| (TBD) | P4: Polish | ⏳ pending | M6 补齐API + M7 稳定化 |

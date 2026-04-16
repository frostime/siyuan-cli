# Memory · siyuan-cli (Root)

## State

Design phase. P1 sub-change created, spec.md + design.md written. Pending @align gate before planning/implementation.

## Key Files

- `reference/siyuan-cli-design/` — 完整预设计文档（9章 v2版），所有架构决策的原始出处
- `reference/siyuan-cli-design/skeleton/src/core/schema.ts` — 全局类型锚，P1 落库时直接复制

## Knowledge

- [2026-04-17T01:36] [Decision] 包名 `siyuan-cli`（无 scope），入口命令 `siyuan`
- [2026-04-17T01:36] [Decision] 未决议 Q1-Q9 全部采纳 reference/siyuan-cli-design/09-open-questions.md 的推荐方案
- [2026-04-17T01:36] [Decision] 设计文档 mv 至 root change reference/，spec/design 只写增量信息
- [2026-04-17T01:36] [Constraint] P1 的 SiyuanClient 接口冻结后 P2/P3 不得修改签名（破坏性变更需 @align）
- [2026-04-17T01:36] [Constraint] Tool 必须通过 ctx.callEndpoint 调用 kernel，不得绕过权限引擎

## Milestones

- [2026-04-17T01:49] Implement P1: 全部实现完成，M0+M1 验证通过，等待 review

## Coordination

| Sub-change | Phase | Status | Deliverable |
|------------|-------|--------|-------------|
| 26-04-17T01-36_p1-foundation | P1: Foundation | 🚧 REVIEW | M0 骨架 + M1 Workspace 管理 |
| (TBD) | P2: API Layer | ⏳ pending | M2 API直通 + M3 权限引擎 |
| (TBD) | P3: Tool + Skill | ⏳ pending | M4 Tool层 + M5 Skill管理 |
| (TBD) | P4: Polish | ⏳ pending | M6 补齐API + M7 稳定化 |

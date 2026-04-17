---
change: "endpoint-tag-and-permission-model"
change-type: root
updated: 2026-04-18T00:00:00+08:00
---

# Milestones

## Legend
`[ ]` Todo | `[x]` Done (sub-change completed + verified)

## Milestones

### Phase 1: Core Contracts ⏳
- [x] Sub-change created and linked
- [x] Sub-change completed and verified
**Deliverable**: classification / payloadTargets / config v2 / resolver / error taxonomy / confirm semantics 定稿并实现
**Sub-change**: `26-04-18T01-28_p1-core-contracts`

### Phase 2: Demo Adoption ⏳
- [ ] Sub-change created and linked
- [ ] Sub-change completed and verified
**Deliverable**: `block.moveBlock`、`query.sql`、`file.putFile` 三个 demo endpoint 在新模型下可运行并通过验证
**Sub-change**: TBD after gate

### Phase 3: Rollout ⏳
- [ ] Sub-change created and linked
- [ ] Sub-change completed and verified
**Deliverable**: 分批迁移剩余 endpoint/tool/docs/tests，形成稳定的 v2 权限语义模型
**Sub-change**: TBD after gate

---

## Progress

**Overall**: 33%

| Phase | Sub-Change | Status | Deliverable |
|-------|------------|--------|-------------|
| P1: Core Contracts | 26-04-18T01-28_p1-core-contracts | ✅ DONE | 共享契约定稿 + 实现 |
| P2: Demo Adoption | TBD | ⏳ | 3 个代表性 endpoint 验证 |
| P3: Rollout | TBD | ⏳ | 批量迁移与文档完善 |

**Recent**:
- [2026-04-18] Root change scope 收缩为“机制层 + demo + rollout”三阶段
- [2026-04-18] P1 sub-change 已创建并链接：`26-04-18T01-28_p1-core-contracts`
- [2026-04-18] P1 implementation 完成并进入 review
- [2026-04-18] P1 review 通过，标记 DONE

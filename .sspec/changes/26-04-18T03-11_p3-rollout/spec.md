---
name: p3-rollout
status: REVIEW
change-type: single
created: 2026-04-18T03:11:51
reference:
  - source: ".sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model"
    type: "root-change"
    note: "Phase 3: Rollout"
  - source: ".sspec/changes/26-04-18T02-23_p2-demo-adoption"
    type: "prev-change"
    note: "Consumes validated contracts and demo patterns from P2"
  - source: ".sspec/changes/26-04-18T03-11_p3-rollout/revisions/001-guard-semantics-and-phase-6-gate.md"
    type: "revision"
    note: "Clarify response semantics, add behavioral tests, and define Phase 6 gate"
  - source: ".sspec/changes/26-04-18T03-11_p3-rollout/revisions/002-phase-6-review-follow-ups.md"
    type: "revision"
    note: "Record schema correction, close risk follow-up, and add array endpoint behavioral coverage"
---

# P3: Rollout

## Problem Statement

P1 已冻结共享契约，P2 已在 7 个代表性 endpoint 上验证它们能工作，但绝大多数 `src/apis/**` 仍停留在 legacy `tags` / legacy `guard.payload` 形态。只要 rollout 没做完：

- runtime 仍依赖 legacy bridge 兼容层
- 新旧 schema 语义并存，认知成本高
- `deriveClassificationFromLegacyTags()` 不能移除
- workspace / content / runtime 分类仍不完整，review 需要不断心算 legacy fallback

P3 的目标是**批量迁移剩余 endpoint 到 authored `classification` + `payloadTargets` 模型，并在最后移除 legacy bridge**。

## Proposed Solution

### Approach

P3 按 **endpoint group batching** 推进，避免 60+ 文件一次性修改不可 review。每个 batch 必须满足同一套最小迁移动作：

1. 填写 `classification`，禁止继续依赖 legacy tags
2. 若输入字段是资源引用，必须填写 `payloadTargets`
3. 若 `mode=read && scope=global`，必须保留/补充 response guard 或 `filterResponse`
4. 若 risk 矩阵显著失真，显式填写 `riskOverride` 并写出原因
5. 删除 `tags`

P3 同时定义一个 **contract gate**：若某 batch 涉及数组资源引用（如 `moveDocs.fromPaths[]`、`moveDocsByID.fromIDs[]`、`transferBlockRef.refIDs[]`），而当前 P1 契约尚不支持数组型 `payloadTargets`，则该 batch 不得私自扩展 schema，必须先回到 P1 amendment 再继续。

### Key Change

**Batch A: Content core rollout**
迁移 `block.*`、`attr.*`、`export.*`、`convert.*`、`template.*`、`search.*` 中与当前契约兼容的 endpoint。优先覆盖 remaining `block.*`，因为它们最容易带多 id / content path 风险。

**Batch B: Workspace + tree/notebook rollout**
迁移 remaining `file.*`、`filetree.*`、`notebook.*`。其中 workspace path 必须一律走 `workspace-path`；filetree / notebook 需按 notebook/path/id 资源语义逐个补齐 `payloadTargets`。

**Batch C: Runtime / meta / network rollout**
迁移 remaining `system.*`、`notification.*`、`network.*`、`sqlite.*`，统一到 `invoke/runtime|network` / `read/meta` 模型，并明确需要 `riskOverride` 的 endpoint。

**Batch D: Legacy bridge removal**
当所有 remaining endpoint 都已 authored `classification` 后，移除 `deriveClassificationFromLegacyTags()` 与过渡兼容路径，使 registry 只接受新模型。

### Scope Summary

| Area | Change |
|---|---|
| `src/apis/block/**` | 批量迁移 remaining content read/write endpoints |
| `src/apis/attr/**` | 迁移 attrs read/write |
| `src/apis/export/**` / `convert/**` / `template/**` / `search/**` | 迁移 utility/global read endpoints |
| `src/apis/file/**` / `filetree/**` / `notebook/**` | 迁移 workspace/tree/notebook endpoints |
| `src/apis/system/**` / `notification/**` / `network/**` / `sqlite/**` | 迁移 runtime/meta/network endpoints |
| `src/core/registry.ts` | 在 rollout 收尾时移除 legacy bridge |
| `README.md` / docs / tests | 补齐 rollout 后的 examples、验证、说明 |

### Design Reference

→ 详细技术设计见 [design.md](./design.md)

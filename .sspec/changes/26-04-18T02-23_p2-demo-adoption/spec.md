---
name: p2-demo-adoption
status: REVIEW
change-type: single
created: 2026-04-18T02:23:08
reference:
  - source: ".sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model"
    type: "root-change"
    note: "Phase 2: Demo Adoption"
  - source: ".sspec/changes/26-04-18T01-28_p1-core-contracts"
    type: "prev-change"
    note: "Consumes frozen contracts from P1"
  - source: ".sspec/changes/26-04-18T02-23_p2-demo-adoption/revisions/001-demo-scope-expansion-and-guard-validation.md"
    type: "revision"
    note: "Expand demo set from 3 to 7 and deepen validation from metadata to guard execution"
---

# P2: Demo Adoption

## Problem Statement

P1 已冻结共享契约，但当前 demo endpoint 仍停留在 legacy schema 形态，导致新契约还没有在足够多的代表性类别上被真实验证：

- content read / write
- global read
- workspace read / write
- runtime invoke（critical / safe-override）

如果跳过 P2 直接进入批量 rollout，P3 就会同时承担“契约第一次真实落地”和“大量 endpoint 迁移”两种风险，review 很难聚焦。

## Proposed Solution

### Approach

P2 迁移 7 个代表性 demo endpoint，并通过它们覆盖主要类别：

1. `block.moveBlock` —— content write + multi-id payload guard
2. `block.getBlockKramdown` —— content read + single-id resolve
3. `query.sql` —— global read + response filter
4. `file.getFile` —— workspace read
5. `file.putFile` —— workspace write + `workspace-path`
6. `system.exit` —— runtime invoke + critical override
7. `notification.pushMsg` —— runtime invoke + safe override

P2 的原则是：**只验证 P1 契约，不扩展 P1 契约**。如果在 demo 落地时发现 contract gap，必须回到 P1 amendment，不在 P2 内临时加字段或私有规则。

### Key Change

**Demo A: `block.moveBlock` migrates to classification + payloadTargets**  
将 `moveBlock` 从 legacy `tags` / `guard.payload` 迁到：
- `classification: write/content/single/move`
- `payloadTargets`: `id` / `parentID` / `previousID` 三条独立 write target

**Demo B: Content read and global read adoption**  
将 `block.getBlockKramdown` 与 `query.sql` 迁到新模型：
- `getBlockKramdown`: `classification: read/content/single/inspect` + `payloadTargets[{ id -> read }]`
- `query.sql`: `classification: read/content/global/query` + 保留 response filter
- 验证 single-id read 与 global read 两种读取路径都在新 registry 下稳定工作

**Demo C: Workspace read/write adoption**  
将 `file.getFile` 与 `file.putFile` 迁到 workspace 模型：
- `getFile`: `classification: read/workspace/single/inspect` + `workspace-path` read target
- `putFile`: `classification: write/workspace/single/update` + `workspace-path` write target
- 验证 workspace 规则和 content 规则从此分离

**Demo D: Runtime invoke adoption**  
将 `system.exit` 与 `notification.pushMsg` 迁到 runtime invoke 模型：
- `system.exit`: `classification: invoke/runtime/single/control` + `riskOverride: critical`
- `pushMsg`: `classification: invoke/runtime/single/control` + `riskOverride: safe`
- 验证 runtime invoke category 在高低风险两端都能被正确表达

**Demo E: Demo-focused validation**  
补充针对这 7 个 endpoint 的 targeted checks，验证：
- `moveBlock` 三个 id 任一命中 deny path 时被拒绝
- `getBlockKramdown` 按 content.read 规则进行 payload 阶段检查
- `query.sql` response filter 正常过滤敏感结果
- `file.getFile` / `file.putFile` 分别命中 workspace.read / workspace.write
- `system.exit` / `pushMsg` 具备正确的 runtime invoke 风险表达

### Scope Summary

| File | Change |
|---|---|
| `src/apis/block/moveBlock.ts` | 迁到 `classification` + `payloadTargets[]` |
| `src/apis/block/getBlockKramdown.ts` | 迁到 `classification` + read payload target |
| `src/apis/query/sql.ts` | 迁到 `classification`，保留 response guard |
| `src/apis/file/getFile.ts` | 迁到 `classification` + `workspace-path` read target |
| `src/apis/file/putFile.ts` | 迁到 `classification` + `workspace-path` write target |
| `src/apis/system/exit.ts` | 迁到 `classification` + `riskOverride: critical` |
| `src/apis/notification/pushMsg.ts` | 迁到 `classification` + `riskOverride: safe` |
| `README.md` | 如有必要，补 demo endpoint 相关说明或 examples |
| `tests/**` 或 targeted validation assets | 增加/补充 demo endpoint 验证 |

### Design Reference

→ 详细技术设计见 [design.md](./design.md)

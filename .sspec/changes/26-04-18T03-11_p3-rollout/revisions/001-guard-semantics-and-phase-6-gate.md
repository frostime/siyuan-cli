---
revision: 1
date: 2026-04-18T14:56:33
trigger: "review-feedback"
---

# guard semantics and phase 6 gate

## Reason
Review of P3 Batch A1→C found that the migrated schemas are mostly correct, but several review/contract gaps should be handled before entering Phase 6:

1. `insertBlock` was structurally migrated but lacked guard-path behavioral tests for its three optional id fields.
2. Several response guards were corrected from `data.*` paths to post-client paths (`blocks[*]`, `notebooks[*]`), but the response-shape contract was not explicitly recorded.
3. Phase 6 bridge removal cannot start while array-contract holdouts remain unresolved.
4. `riskOverride` usage needs inline rationale.

The response-shape question was clarified with the user: `guard.response.itemsAt` is evaluated against the unwrapped `data` returned by `SiyuanClient`, not against the raw kernel envelope.

## Changes

### Spec Impact
P3 acceptance now includes the following additional requirements before Phase 6:

- behavioral guard-path tests must cover new migrated patterns, especially `insertBlock`
- response guard paths must be documented as relative to unwrapped `data`
- Phase 6 must choose the full-removal path: add array authorization support first, migrate holdouts, then remove legacy bridge
- every `riskOverride` must include a short code comment explaining why the matrix default is wrong

### Design Impact
P3 design is amended by clarifying response semantics:

```text
SiyuanClient.call() / upload() unwraps kernel response and returns body.data.
Therefore guard.response.itemsAt is relative to body.data.
Examples: blocks[*], notebooks[*]
Root arrays should use filterResponse.
```

Phase 6 gate is tightened:

```text
Do not remove deriveClassificationFromLegacyTags() while array-contract holdouts remain.
Preferred path: return to P1 amendment for array item authorization, migrate holdouts, then remove bridge.
```

### Task Impact
- add behavior tests for `insertBlock` optional-id write guards
- add response-shape tests for post-client guard paths
- add code comments for existing `riskOverride` fields
- record Phase 6 gate decision in memory/tasks

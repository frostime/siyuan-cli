---
revision: 2
date: 2026-04-18T16:45:16+08:00
trigger: "review-feedback"
---

# phase 6 review follow-ups

## Reason
Post-implementation review of Batch Z accepted the overall Phase 6 direction, but identified three follow-up items that should be closed before P3 review:

1. `filetree/getIDsByHPath.ts` changed payload shape from local `paths: string[]` to upstream-aligned `path: string`; this correction must be recorded explicitly instead of living only as an implicit code diff.
2. `system/logoutAuth.ts` still used the default runtime invoke risk bucket even though it invalidates session state rather than destroying data.
3. Phase 6 tests proved the generic array guard contract, but lacked one endpoint-level behavioral test showing that a migrated array holdout blocks execution before the API call.

## Changes

### Spec Impact
P3 closeout now additionally requires:

- explicit changelog-quality documentation when rollout includes a payload schema correction
- explicit disposition for review-raised risk classification mismatches
- at least one endpoint-level behavioral test for migrated array payload authorization

### Design Impact
`filetree/getIDsByHPath.ts` is reclassified from the old array-holdout note to an upstream-schema correction:

```text
local pre-phase-6 schema: notebook + paths:string[]
upstream SDK semantics: notebook + path:string (hpath)
phase-6 action: align local schema to upstream and guard notebook scope only
```

The Phase 6 cleanup decision log also records that imperative `filterResponse` duplication is intentionally left in place for now.

### Task Impact
- add explicit code/documentation trail for `getIDsByHPath` payload correction
- apply `logoutAuth` riskOverride with inline rationale
- add one array-holdout behavioral test at endpoint level
- record deferred helper extraction decision in memory

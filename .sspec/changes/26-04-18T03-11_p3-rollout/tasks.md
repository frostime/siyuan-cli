---
change: "p3-rollout"
updated: 2026-04-18T03:15:00+08:00
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Batch A1 — block + attr ✅
- [x] Migrate remaining contract-compatible `src/apis/block/*.ts` endpoints except `transferBlockRef.ts`
- [x] Migrate `src/apis/attr/*.ts`
- [x] Run batch A1 regression checks
- [x] Record `transferBlockRef.ts` as blocked by array contract gate
**Verification**: typecheck/build/api-list/tests passed; migrated A1 endpoints no longer retain `tags`; `transferBlockRef.ts` remains explicit legacy holdout

### Phase 2: Batch A2 — export / convert / template / search / asset ✅
- [x] Migrate contract-compatible endpoints in `src/apis/export/*.ts`, `src/apis/convert/*.ts`, `src/apis/template/*.ts`, `src/apis/search/*.ts`, `src/apis/asset/*.ts`
- [x] Identify `exportResources.ts` as array-contract-gated holdout
- [x] Run batch A2 regression checks
**Verification**: migrated global-read endpoints keep response guard/filter; `exportResources.ts` remains explicit legacy holdout

### Phase 3: Batch B1 — file + notebook ✅
- [x] Migrate remaining `src/apis/file/*.ts`
- [x] Migrate `src/apis/notebook/*.ts`
- [x] Run batch B1 regression checks
**Verification**: workspace endpoints consistently use `workspace-path`; notebook endpoints use notebook/id/path targets appropriately

### Phase 4: Batch B2 — filetree ✅
- [x] Migrate contract-compatible `src/apis/filetree/*.ts`
- [x] Isolate array-resource filetree endpoints behind amendment if needed
- [x] Run batch B2 regression checks
**Verification**: filetree endpoints have explicit classification/targets; `moveDocs.ts`, `moveDocsByID.ts`, and `getIDsByHPath.ts` remain explicit array-contract holdouts

### Phase 5: Batch C — system / notification / network / sqlite ✅
- [x] Migrate remaining `src/apis/system/*.ts`, `src/apis/notification/*.ts`, `src/apis/network/*.ts`, `src/apis/sqlite/*.ts`
- [x] Finalize explicit `riskOverride` list for runtime/network edge cases
- [x] Run batch C regression checks
**Verification**: runtime/meta/network split is complete and riskOverride usage is explicit

### Phase 6: Batch Z — bridge removal + docs/tests cleanup ✅
- [x] Complete P1 amendment for array item authorization
- [x] Migrate array-contract holdouts
- [x] Remove `deriveClassificationFromLegacyTags()` and related transition-only code after holdouts are gone
- [x] Update `README.md` / key docs / tests to reflect full rollout
- [x] Run final full regression checks
- [x] Update `memory.md` State + Milestones with results
**Verification**: no endpoint relies on legacy tags; final regression suite passes

### Feedback Tasks (→ [001-guard-semantics-and-phase-6-gate](./revisions/001-guard-semantics-and-phase-6-gate.md))
- [x] Clarify and document response guard semantics as post-client unwrapped `data`
- [x] Add code comments documenting response guard semantics
- [x] Add `insertBlock` guard-path behavioral tests
- [x] Add response-shape behavioral tests for post-client guard paths
- [x] Add comments for existing `riskOverride` fields
- [x] Define Phase 6 path decision for array-contract holdouts
**Verification**: targeted P3 tests include guard-path and response-shape coverage

### Feedback Tasks (→ [002-phase-6-review-follow-ups](./revisions/002-phase-6-review-follow-ups.md))
- [x] Record `getIDsByHPath` payload correction explicitly in revision/code comments/design
- [x] Apply `logoutAuth` risk follow-up with rationale
- [x] Add one endpoint-level behavioral test for migrated array authorization
- [x] Record deferred `filterResponse` helper extraction decision in memory
**Verification**: Phase 6 follow-up review points are reflected in docs/code/tests

### Feedback Tasks (→ [003-guard-hardening-and-path-semantics](./revisions/003-guard-hardening-and-path-semantics.md))
- [x] Harden `applyPayloadGuard()` against malformed array-shaped payloads
- [x] Keep `getIDsByHPath` notebook-only guard, but record hpath limitation explicitly
- [x] Add `CONTENT_FILTERED` warning to `searchDocs` imperative filtering
- [x] Record `kind: "path"` semantic ambiguity and `forwardProxy` critical-risk rationale
**Verification**: malformed array payloads fail loud; searchDocs filtering warns; review decisions are explicit in code/memory

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 100% | ✅ |
| Phase 5 | 100% | ✅ |
| Phase 6 | 100% | ✅ |

**Recent**:
- [2026-04-18] Plan: created batch-based rollout plan for remaining endpoint migration
- [2026-04-18] Implement: migrated Batch A1 contract-compatible endpoints and added `tests/p3-rollout-batch-a1.test.ts`
- [2026-04-18] Implement: advanced rollout through Batch C and stopped before Batch Z bridge removal
- [2026-04-18] Implement: completed Batch Z holdout migration, removed legacy bridge, and passed final targeted regression
- [2026-04-18] Review-Fix: hardened array guard execution and documented hpath/path semantics

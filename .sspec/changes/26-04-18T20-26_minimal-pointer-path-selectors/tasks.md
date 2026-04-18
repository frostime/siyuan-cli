---
change: "minimal-pointer-path-selectors"
updated: 2026-04-18T20:49:00+08:00
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Contract finalize + evaluator scaffold ✅
- [x] Finalize `spec.md` / `design.md` around shared `PointerPath` semantics
- [x] Confirm naming choice: payload uses `path`, response keeps `itemsAt`
- [x] Lock non-goals: no full JSONPath, no new `ResourceKind`, keep `filterResponse`
**Verification**: design predicts implementation shape and user confirmed the naming/boundary decisions

### Phase 2: Core selector engine ✅
- [x] Update `src/core/schema.ts` contract types from `field/isArray` to `path` and define the `PointerPath` type
- [x] Implement the shared selector evaluator and shape-error semantics in `src/core/schema.ts`
- [x] Rewrite `src/core/guard.ts` payload guard and declarative response guard to use the shared evaluator
- [x] Add focused selector grammar / shape-error coverage in `tests/p1-core-contracts.test.ts`
**Verification**: `PointerPath` grammar works for scalar, nested-array, and root-array forms; malformed shapes fail loud

### Phase 3: Endpoint schema migration ✅
- [x] Migrate `src/apis/**` payload targets from `{ field, isArray }` to `{ path }`
- [x] Convert eligible root-array response filters in `src/apis/query/sql.ts`, `src/apis/block/getChildBlocks.ts`, and `src/apis/filetree/searchDocs.ts` to declarative `itemsAt: "[*]"`
- [x] Keep `src/apis/filetree/listDocsByPath.ts` imperative because its response shape needs write-back handling
**Verification**: migrated endpoint schemas stay behaviorally equivalent and imperative response duplication is reduced as designed

### Phase 4: Regression + docs cleanup ✅
- [x] Confirm `README.md` has no contract-facing `field/isArray` examples to update
- [x] Refresh P1/P2/P3 regression expectations in existing tests
- [x] Run full targeted regression for selector migration
**Verification**: `pnpm typecheck`, `pnpm build`, `node dist/cli.mjs api list`, and the targeted P1/P2/P3 test suite all pass

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 100% | ✅ |

**Recent**:
- [2026-04-18] Clarify: confirmed this work should be an independent change focused on unifying payload/response selectors
- [2026-04-18] Design: drafted spec/design around a minimal `PointerPath` contract
- [2026-04-18] Plan: converted the design into a file-level implementation plan
- [2026-04-18] Implement: completed PointerPath migration and passed targeted regression

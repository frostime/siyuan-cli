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

### Feedback Tasks (→ [001-pathprogram-runtime-redesign](./revisions/001-pathprogram-runtime-redesign.md))
- [x] Replace temporary response write-back helper with PathProgram-style terminal filtering
- [x] Restore `CONTENT_FILTERED` warning behavior for declarative root-array response guards
- [x] Add regression coverage for terminal-array filtering and warning behavior
- [x] Keep response shape mismatch fail-loud by design
**Verification**: PathProgram runtime tests pass and declarative root-array filtering emits warnings

### Feedback Tasks (→ [002-terminal-filter-boundary](./revisions/002-terminal-filter-boundary.md))
- [x] Reject multi-expand terminal filtering in `runPointerFilterTerminal()`
- [x] Add regression coverage for the rejected multi-expand shape
- [x] Clean small runtime helper issues and improve payload-root validation message
- [x] Record documentation-worthy selector boundary decisions in memory
**Verification**: multi-expand terminal filters fail loud and targeted regression still passes

### Feedback Tasks (→ [003-dry-run-and-response-validation](./revisions/003-dry-run-and-response-validation.md))
- [x] Remove the command-layer `--dry-run` bypass in `src/commands/api.ts`
- [x] Validate declarative `response.itemsAt` terminal-filter compatibility at registry startup
- [x] Add regression coverage for startup rejection of unsupported response filter shapes
- [x] Record additional documentation-worthy execution-path decisions in memory
**Verification**: real CLI dry-run now follows shared guard execution and unsupported `response.itemsAt` shapes fail at startup

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
- [2026-04-18] Review-Fix: upgraded selector runtime to PathProgram terminal filtering and passed targeted regression
- [2026-04-19] Review-Fix: tightened terminal filter boundary and recorded documentation candidates for selector semantics
- [2026-04-19] Review-Fix: aligned dry-run execution and startup validation with the documented model

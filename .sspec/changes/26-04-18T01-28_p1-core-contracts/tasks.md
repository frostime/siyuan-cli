---
change: "p1-core-contracts"
updated: 2026-04-18T01:29:30+08:00
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Core types + registry bridge ✅
- [x] Implement new core types and transitional schema bridge in `src/core/schema.ts`
- [x] Implement meta normalization and global-read guard validation in `src/core/registry.ts`
- [x] Update API command metadata consumers in `src/commands/api.ts`
**Verification**: `pnpm typecheck` passed; `node dist/cli.mjs api list` executed successfully with normalized registry metadata

### Phase 2: Config v2 + permission engine ✅
- [x] Implement config v2 shape and alpha-only schemaVersion handling in `src/core/config.ts`
- [x] Implement bulk resolver, error taxonomy, read/write-independent policy checks, and tool deny in `src/core/permission.ts`
- [x] Update tool runtime entry checks in `src/commands/tool.ts` and context wiring in `src/core/tools.ts`
**Verification**: `pnpm typecheck` passed; build succeeded; deny logic is wired through tool and endpoint call paths

### Phase 3: Async guard pipeline + docs ✅
- [x] Refactor `src/core/guard.ts` to async payload target checks with legacy guard compatibility
- [x] Update call sites to pass `RegisteredEndpoint` into execution path
- [x] Refresh `README.md` config/security sections for config v2 and deny-vs-confirm model
**Verification**: typecheck passed; guard path supports both legacy `guard.payload` and new `payloadTargets`

### Phase 4: P1 contract validation ✅
- [x] Run `pnpm typecheck`
- [x] Run targeted smoke checks for registry normalization and config v2 loading
- [x] Update `memory.md` State + Milestones with results
**Verification**: `pnpm typecheck`, `pnpm build`, and `node dist/cli.mjs api list` all succeeded; no P2 endpoint schema migration was included

### Feedback Tasks (→ [001-contract-hardening-and-tests](./revisions/001-contract-hardening-and-tests.md))
- [x] Tighten the public permission contract and remove the misleading `checkDeny` interface exposure
- [x] Add fail-loud validation for schema missing both `classification` and legacy `tags`
- [x] Add `payloadTargets.field` static validation in registry
- [x] Make heuristic payload guard surface-aware so workspace endpoints treat `path` as `workspace-path`
- [x] Add targeted contract tests for registry / permission / guard
**Verification**: `tsx --test tests/p1-core-contracts.test.ts` passes

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
- [2026-04-18] Plan: created file-level execution plan for P1 core contracts
- [2026-04-18] Implement: completed P1 contract implementation and validation
- [2026-04-18] Review-Fix: completed contract hardening follow-up and targeted tests

---
change: "p2-demo-adoption"
updated: 2026-04-18T02:31:00+08:00
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Content demos ✅
- [x] Migrate `src/apis/block/moveBlock.ts` to `classification` + `payloadTargets`
- [x] Migrate `src/apis/block/getBlockKramdown.ts` to `classification` + read payload target
- [x] Migrate `src/apis/query/sql.ts` to `classification` while preserving response guard
**Verification**: typecheck passed and targeted P2 tests confirm normalized metadata for content demos

### Phase 2: Workspace + runtime demos ✅
- [x] Migrate `src/apis/file/getFile.ts` to `classification` + `workspace-path` read target
- [x] Migrate `src/apis/file/putFile.ts` to `classification` + `workspace-path` write target
- [x] Migrate `src/apis/system/exit.ts` to `classification` + `riskOverride: critical`
- [x] Migrate `src/apis/notification/pushMsg.ts` to `classification` + `riskOverride: safe`
**Verification**: typecheck passed and targeted P2 tests confirm runtime/workspace metadata matches design

### Phase 3: Demo validation ✅
- [x] Add targeted validation for P2 demo endpoint metadata and guard shape
- [x] Run `pnpm typecheck`
- [x] Run `pnpm build`
- [x] Run targeted P1 and P2 tests / smoke checks
- [x] Update `memory.md` State + Milestones with results
**Verification**: `pnpm typecheck`, `pnpm build`, `node dist/cli.mjs api list`, and targeted tests all succeeded

### Feedback Tasks (→ [001-demo-scope-expansion-and-guard-validation](./revisions/001-demo-scope-expansion-and-guard-validation.md))
- [x] Record why P2 expanded from 3 demos to 7 representative endpoints
- [x] Deepen P2 validation from metadata-only assertions to guard execution checks
- [x] Align root documents with actual P2 coverage
**Verification**: targeted guard-path tests pass and root/P2 docs agree on demo scope

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |

**Recent**:
- [2026-04-18] Plan: created file-level execution plan for P2 demo adoption
- [2026-04-18] Implement: completed demo migrations and validation for seven representative endpoints
- [2026-04-18] Review-Fix: recorded scope expansion and added guard-path validation

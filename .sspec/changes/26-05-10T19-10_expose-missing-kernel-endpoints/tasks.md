---
change: "expose-missing-kernel-endpoints"
updated: "2026-05-11T02:20+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Research integration and guard prerequisite ⏳
- [x] Update `spec.md` / `design.md` / `memory.md` to reference `reference/missing-kernel-api-contracts.md` and concrete baseline decisions.
- [x] Update `src/api/guard.ts` to skip empty-string payload targets so optional anchor IDs can be schema-valid without false permission failures.
**Verification**: `pnpm run typecheck`; existing guarded endpoints keep behavior for non-empty IDs.

### Phase 2: Attribute and batch Kramdown endpoints ⏳
- [x] Add `src/api/endpoints/attr/batchGetBlockAttrs.ts`.
- [x] Add `src/api/endpoints/attr/batchSetBlockAttrs.ts`.
- [x] Add `src/api/endpoints/block/getBlockKramdowns.ts`.
**Verification**: registry loads; endpoint describe shows expected payload/guard/classification.

### Phase 3: Batch block creation endpoints ⏳
- [x] Add `src/api/endpoints/block/batchInsertBlock.ts`.
- [x] Add `src/api/endpoints/block/batchAppendBlock.ts`.
- [x] Add `src/api/endpoints/block/batchPrependBlock.ts`.
**Verification**: registry loads; schemas allow intended payload shapes including empty optional insert anchors.

### Phase 4: Block read/helper endpoints ⏳
- [x] Add `src/api/endpoints/block/getDocInfo.ts`.
- [x] Add `src/api/endpoints/block/getDocsInfo.ts`.
- [x] Add `src/api/endpoints/block/getTailChildBlocks.ts`.
- [x] Add `src/api/endpoints/block/getBlockSiblingID.ts`.
- [x] Add `src/api/endpoints/block/appendDailyNoteBlock.ts`.
- [x] Add `src/api/endpoints/block/prependDailyNoteBlock.ts`.
**Verification**: registry loads; `getDocsInfo` defaults `refCount=false`, `av=false`.

### Phase 5: Filetree endpoints and registration ⏳
- [x] Add `src/api/endpoints/filetree/duplicateDoc.ts`.
- [x] Add `src/api/endpoints/filetree/getFullHPathByID.ts`.
- [x] Update `src/api/endpoints/index.ts` to import/register all new schemas.
**Verification**: `pnpm run typecheck`; `pnpm run siyuan api list` includes all 14 new endpoint IDs.

### Phase 6: Local dev smoke tests and final verification ⏳
- [x] Temporarily update project `.siyuan-cli.yaml` if needed, keeping `workspace: dev`, and restore it after tests.
- [x] Smoke test representative read endpoints against dev workspace: `attr.batchGetBlockAttrs`, `block.getBlockKramdowns`, `block.getDocsInfo`, `block.getBlockSiblingID`, `filetree.getFullHPathByID`.
- [x] Run `pnpm run typecheck`, `pnpm run build`, and `pnpm run test`.
**Verification**: smoke outputs match expected shapes; `.siyuan-cli.yaml` restored with no diff; any unrelated test failure is documented.

### Feedback Tasks (→ [001-add-response-guards-for-new-endpoints](./revisions/001-add-response-guards-for-new-endpoints.md))
- [x] Update `src/shared/schema.ts` and `src/api/guard.ts` so custom `filterResponse` receives caller context.
- [x] Add response data type declarations for all 14 newly added endpoint schemas.
- [x] Add response-side permission filtering for resource-bearing map/array/single-object responses.
- [x] Add tests covering new response filter behavior.
- [x] Run `pnpm run typecheck`, `pnpm run build`, and relevant tests.
- [x] Add custom compact formatters for `attr.batchGetBlockAttrs` and `block.getBlockKramdowns`.

### Feedback Tasks (→ [002-address-review-findings](./revisions/002-address-review-findings.md))
- [x] Change empty-string payload guard skipping from global behavior to explicit `skipEmpty` target declarations.
- [x] Record nullable `block.getDocsInfo` response item concern as a separate request instead of changing runtime behavior now.
- [x] Add concise docs for `api raw` and common new batch endpoint usage.
- [x] Add limited raw API tests for endpoint normalization, allowlist behavior, and stdout/stderr contract.
- [x] Run `pnpm run typecheck`, `pnpm run test`, and `pnpm run build`.

### Feedback Tasks (→ [003-emit-warnings-for-custom-response-filters](./revisions/003-emit-warnings-for-custom-response-filters.md))
- [x] Extend custom `filterResponse` context with a filtering-warning emitter.
- [x] Update custom response-guard helpers to emit `CONTENT_FILTERED` when entries/fields are removed.
- [x] Add tests covering warnings for custom map/object/sibling filters.
- [x] Run `pnpm run typecheck`, `pnpm run test`, and `pnpm run build`.

### Feedback Tasks (→ [004-update-agent-docs-for-batch-and-filtering-guidance](./revisions/004-update-agent-docs-for-batch-and-filtering-guidance.md))
- [x] Update `skills/siyuan-cli/SKILL.md` with batch endpoint recommendations, filtered-result semantics, and registered/raw/extension choice strategy.
- [x] Fix `src/docs/siyuan-guide/siyuan-block.md` command flag casing and add batch endpoint guidance.
- [x] Update `src/docs/cli-usage/permission.md` / `cli-overview.md` with `CONTENT_FILTERED` interpretation.
- [x] Fix `src/docs/cli-usage/extension.md` raw helper return-shape example and raw-vs-extension strategy.
- [x] Verify docs with targeted grep and run `pnpm run typecheck`.

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
- [2026-05-10T21:36+08:00] Plan created from archived web-agent research; user allowed temporary `.siyuan-cli.yaml` edits for dev-space testing.
- [2026-05-10T21:36+08:00] Integrated research baseline into spec/design and updated guard to skip empty-string payload targets.
- [2026-05-10T21:38+08:00] Added batch attribute and plural Kramdown endpoint schemas.
- [2026-05-10T21:40+08:00] Added batch insert/append/prepend block endpoint schemas.
- [2026-05-10T21:42+08:00] Added block info/sibling/tail/daily-note helper endpoint schemas.
- [2026-05-10T21:44+08:00] Added filetree duplicate/full-hpath endpoints and registered all new schemas.
- [2026-05-10T21:49+08:00] Verified typecheck/build, registry listing, dev smoke reads, batchInsert empty-anchor dry-run, and `.siyuan-cli.yaml` restore; full test suite still has unrelated `getChildBlocks` assertion failure.
- [2026-05-10T22:53+08:00] Review feedback classified as amend; revision 001 created for response declarations and response-side guards.
- [2026-05-10T23:01+08:00] Implemented response declarations and response-side filters; typecheck/build/endpoint-schemas tests pass; full test suite still has the pre-existing getChildBlocks assertion failure.
- [2026-05-11T00:09+08:00] Added formatting follow-up to revision 001: custom compact outputs for batch attrs and plural Kramdown.
- [2026-05-11T00:09+08:00] Implemented compact formatters; Kramdown multi-block output uses a system hint plus `--- id: ...` splitters, without Markdown fences.
- [2026-05-11T02:20+08:00] Addressed subagent review findings: explicit `skipEmpty`, nullable getDocsInfo follow-up request, concise docs, raw tests; typecheck/test/build all pass.
- [2026-05-11T17:45+08:00] Implemented revision 003: custom response filters now emit `CONTENT_FILTERED`; typecheck/test/build all pass.
- [2026-05-11T17:55+08:00] Implemented revision 004: updated bundled SKILL/docs for batch endpoint strategy, filtered-result semantics, flag casing, and extension raw helper return shape; targeted grep and typecheck pass.

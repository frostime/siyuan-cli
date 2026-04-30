---
change: "siyuan-write-tools"
updated: 2026-04-30T18:18+08:00
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks
<!-- @REPLACE -->

### Phase 1: Endpoint + Infrastructure 🚧
- [x] Create `src/api/endpoints/import/importStdMd.ts` — endpoint schema per design §3.2 (revision §4) `src/api/endpoints/import/importStdMd.ts`
- [x] Register `import.importStdMd` in endpoint index `src/api/endpoints/index.ts`
- [x] Add importStdMd schema coverage in existing test suite `tests/endpoint-schemas.test.ts`
**Verification**: `pnpm run typecheck` passes; `pnpm exec tsx --test tests/endpoint-schemas.test.ts` importStdMd tests green; `pnpm run siyuan api describe import.importStdMd` shows schema

### Phase 2: brute-edit Tool ✅
- [x] Implement `brute-edit` tool with original-span application model per design §2.2 + revision §5 `src/tool/builtins/brute-edit.ts`
- [x] Register `brute-edit` in tool index `src/tool/builtins/index.ts`
- [x] Add brute-edit behavior tests (uniqueness, overlap, dry-run, safety checks) `tests/tool-write-tools.test.ts`
**Verification**: `pnpm run typecheck` passes; targeted tests green; `pnpm run siyuan tool describe brute-edit` shows schema

### Phase 3: push-md Tool ✅
- [x] Implement `push-md` tool with corrected create/overwrite semantics per design §3.3 + revision §1–3, §6–7 `src/tool/builtins/push-md.ts`
- [x] Register `push-md` in tool index `src/tool/builtins/index.ts`
- [x] Add push-md behavior tests (create refuses existing, overwrite ambiguous, ref safety, root path) `tests/tool-write-tools.test.ts`
**Verification**: `pnpm run typecheck` passes; targeted tests green; `pnpm run siyuan tool describe push-md` shows schema

### Phase 4: Integration Verification ✅
- [x] Full typecheck + full test suite `pnpm run typecheck && pnpm test`
- [x] CLI smoke test: `pnpm run siyuan tool list` shows brute-edit + push-md
- [x] CLI smoke test: `pnpm run siyuan api describe import.importStdMd` shows schema
**Verification**: All checks pass

### Feedback Tasks (→ [001-pre-implement-corrections](./revisions/001-pre-implement-corrections.md))
*(none yet)*

---

## Progress
<!-- @REPLACE -->

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 100% | ✅ |

**Recent**:
- [2026-04-30T18:30] Phase 1–4 complete: endpoint schema registered, brute-edit tool implemented, push-md tool implemented, all tests pass
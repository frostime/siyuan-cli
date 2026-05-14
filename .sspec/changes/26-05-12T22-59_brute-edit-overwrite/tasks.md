---
change: "brute-edit-overwrite"
updated: "2026-05-12T23:18+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Tool behavior ✅
- [x] Implement **Feat A** in `src/tool/builtins/get-block-content.ts`.
- [x] Implement **Feat B** in `src/tool/builtins/brute-edit.ts`.
- [x] Implement **Cleanup C** in `src/tool/builtins/index.ts` and remove `src/tool/builtins/push-md.ts`.
**Verification**: `pnpm run typecheck`; `pnpm run build`; CLI help includes `--bodyOnly` / `--overwrite`; `push-md` is absent from built-in tool list.

### Phase 2: Tests ✅
- [x] Update `tests/tool-write-tools.test.ts` for overwrite source parsing and removed push-md tests.
**Verification**: `pnpm test`.

### Phase 3: Documentation ✅
- [x] Update `skills/siyuan-cli/SKILL.md` safe write guidance.
- [x] Update built-in docs and blog references for removed `push-md` and new overwrite workflow.
- [x] Update `CHANGELOG.md`.
**Verification**: `rg "append-content|push-md" docs src skills README.md` has no active references; docs mention `--bodyOnly` and `--overwrite`.

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |

**Recent**:
- 2026-05-12T22:59+08:00: Created change plan and started implementation.
- 2026-05-12T23:08+08:00: Implemented tool behavior, removed push-md builtin, updated tests/docs, and verified build/typecheck/tests/help.
- 2026-05-12T23:18+08:00: Removed over-general longAliases design; body-only output is exposed through direct `--bodyOnly` flag.
- 2026-05-12T23:30+08:00: Added Smallest Safe Edit Surface guidance and made brute-edit examples emphasize `--check true` before guarded rewrite.

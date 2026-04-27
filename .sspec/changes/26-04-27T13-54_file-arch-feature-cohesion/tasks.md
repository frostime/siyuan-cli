---
change: "file-arch-feature-cohesion"
updated: ""
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Confirm migration contract ✅
- [x] Freeze old→new mapping in `reference/path-migration-map.md`
- [x] Confirm keep-as-is and non-goals with user
**Verification**: User explicitly accepts mapping contract

### Phase 2: Move files by map ✅
- [x] Create target directories (`src/api`, `src/tool`, `src/workspace`, `src/doc`, `src/skill`, `src/shared`)
- [x] Move files/directories exactly per mapping table
**Verification**: All mapped old paths no longer exist; new paths present

### Phase 3: Patch imports and references ✅
- [x] Patch `src/**` imports
- [x] Patch `tests/**` imports
- [x] Patch textual path references in `docs/**`
- [x] Scan and patch textual path references in `src/docs/**` (if any)
**Verification**: `rg` finds no stale `src/core|src/utils|src/commands|src/apis|src/tools` path references in `src/**`, `tests/**`, `docs/**`, and `src/docs/**`

### Phase 4: Verify and clean legacy dirs 🚧
- [x] Run `pnpm typecheck`
- [x] Run `pnpm test` (known failing baseline in permission-related tests; unchanged in this refactor)
- [x] Remove empty legacy dirs (`src/commands`, `src/core`, `src/utils`, `src/apis`, `src/tools`)
**Verification**: Typecheck + build pass; tests keep pre-existing permission-related failures; tree matches target blueprint

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
- 2026-04-27: Completed path-based file migration and import/doc reference rewrites.
- 2026-04-27: `pnpm typecheck` and `pnpm run build` pass after path migration fixes.
- 2026-04-27: `pnpm test` still has existing permission-related failing cases that are outside this structural refactor scope.

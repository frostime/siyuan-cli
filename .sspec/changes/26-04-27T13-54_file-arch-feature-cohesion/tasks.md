---
change: "file-arch-feature-cohesion"
updated: ""
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Confirm migration contract ⏳
- [ ] Freeze old→new mapping in `reference/path-migration-map.md`
- [ ] Confirm keep-as-is and non-goals with user
**Verification**: User explicitly accepts mapping contract

### Phase 2: Move files by map ⏳
- [ ] Create target directories (`src/api`, `src/tool`, `src/workspace`, `src/doc`, `src/skill`, `src/shared`)
- [ ] Move files/directories exactly per mapping table
**Verification**: All mapped old paths no longer exist; new paths present

### Phase 3: Patch imports and references ⏳
- [ ] Patch `src/**` imports
- [ ] Patch `tests/**` imports
- [ ] Patch textual path references in `docs/**`
- [ ] Scan and patch textual path references in `src/docs/**` (if any)
**Verification**: `rg` finds no stale `src/core|src/utils|src/commands|src/apis|src/tools` path references in `src/**`, `tests/**`, `docs/**`, and `src/docs/**`

### Phase 4: Verify and clean legacy dirs ⏳
- [ ] Run `pnpm typecheck`
- [ ] Run `pnpm test`
- [ ] Remove empty legacy dirs (`src/commands`, `src/core`, `src/utils`, `src/apis`, `src/tools`)
**Verification**: Typecheck + tests pass; tree matches target blueprint

---

## Progress
<!-- @REPLACE -->

**Overall**: 15%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 0% | ⏳ |
| Phase 3 | 0% | ⏳ |
| Phase 4 | 0% | ⏳ |

**Recent**:
- 2026-04-27: Created and documented deterministic path migration map in `reference/path-migration-map.md`

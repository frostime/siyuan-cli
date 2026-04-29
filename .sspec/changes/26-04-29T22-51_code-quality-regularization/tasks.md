---
change: "code-quality-regularization"
updated: "2026-04-29"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

### Phase 1: Fix A — Extract pointer-path DSL ⏳
- [x] Create `src/shared/pointer-path.ts` with all pointer-path symbols moved from `schema.ts`
- [x] Remove moved symbols from `src/shared/schema.ts`, add re-exports from `pointer-path.ts`
- [x] Verify: `pnpm run typecheck && pnpm run build && pnpm run test`
**Verification**: All imports from `schema.ts` still resolve; pointer-path functionality unchanged.

### Phase 2: Fix B — Decompose config.ts ⏳
- [x] Create `src/workspace/resolve.ts` with `resolveWorkspace`, `resolveEffectiveWorkspace`, `materializeWorkspace`, and related types. Include `resolveTokenSource` as an internal helper; keep `TokenSource` exported from `config.ts`.
- [x] Remove extracted code from `config.ts`, add re-exports
- [x] Verify: `pnpm run typecheck && pnpm run build && pnpm run test`
**Verification**: All imports from `config.ts` still resolve; workspace resolution unchanged.

---

## Progress

**Overall**: 0%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |

**Recent**:
- Phase 1: pointer-path DSL extracted from schema.ts → `src/shared/pointer-path.ts`
- Phase 2: workspace resolution extracted from config.ts → `src/workspace/resolve.ts`

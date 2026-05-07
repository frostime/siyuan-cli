---
change: "docs-regularize-agent-guidance"
updated: "2026-05-07T09:26"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Correct stale command examples ✅
- [x] Update stale command examples in `skills/siyuan-cli/SKILL.md`.
- [x] Update stale command examples in `src/docs/README.md`.
- [x] Update stale command examples in `src/docs/recipes/find-target.md`.
- [x] Update stale command examples in `src/docs/siyuan-guide/document-tree-and-paths.md`.
- [x] Update command tree in `src/docs/cli-usage/cli-overview.md`.
**Verification**: `rg` finds no known stale examples under `skills src/docs README.md`: `list-doc-tree --notebook`, `list-doc-tree --doc`, `list-doc-tree <`, `list-dailynote --notebook .*--from`, `--md "# Title"`, `v0.11`.

### Phase 2: Regularize edit guidance ✅
- [x] Rewrite `src/docs/recipes/edit-content.md` around scope, pre-flight, strategy selection, side effects, minimal examples, and verification.
**Verification**: file remains a single focused recipe; includes no per-block-type explosion; includes command examples for single update, batch update, insert before/after, append, and brute-edit.

### Phase 3: README and final checks ✅
- [x] Apply minimal README cleanup for version drift and human-facing routing.
- [x] Run markdown grep checks and targeted CLI help checks.
**Verification**: targeted greps pass; edited commands correspond to current `pnpm run siyuan -- ... --help` output.

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |

**Recent**:
- 2026-05-07T09:26: Spec/tasks initialized from user-approved scope.
- 2026-05-07T09:38: Updated stale command examples, rewrote edit-content recipe, and applied README routing/version cleanup.
- 2026-05-07T09:42: Added extension to cli-overview command tree and completed grep/help verification.

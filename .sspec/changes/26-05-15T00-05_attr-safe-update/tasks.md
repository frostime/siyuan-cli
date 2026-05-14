---
change: "attr-safe-update"
created: 2026-05-15T00:05:23
---

# Tasks: attr-safe-update

## Phase 1: Tool Implementation

- [x] Create `src/tool/builtins/update-block.ts` — implement per design.md
- [x] Register in `src/tool/builtins/index.ts`

**Verify**: ✅ `--help` works. E2e: set custom attr → update via tool → attrs preserved. Also tested block without attrs.

## Phase 2: Documentation Updates

- [x] `src/docs/recipes/edit-content.md` — add `update-block` to strategy table, add warning on raw `updateBlock` attr loss, update examples
- [x] `src/docs/cli-usage/cli-overview.md` — replace `block.updateBlock` example with `tool update-block`
- [x] `skills/siyuan-cli/SKILL.md` — replace `block.updateBlock`/`batchUpdateBlock` recommendations with `tool update-block`
- [x] `src/docs/siyuan-guide/siyuan-block.md` — update quick-reference table + add warning

**Verify**: ✅ `rg` confirms no unqualified `updateBlock` recommendations remain — only warnings/side-effect docs.

## Progress

All tasks complete.

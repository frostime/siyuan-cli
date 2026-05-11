---
change: "improve-siyuan-cli-doc-ux"
updated: "2026-05-11T19:20:00+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Rebalance entry layers 🚧
- [x] Restructure `skills/siyuan-cli/SKILL.md` per spec/design: single Agent router, first-response rules, recipe triggers, slimmer command surface.
- [x] Restructure `src/docs/README.md` per spec/design: compact docs map, no duplicate full router.
**Verification**: headings show SKILL as operational router and docs README as map/reference; no duplicate full intent-router tables.

### Phase 2: Deepen recipe playbooks 🚧
- [x] Expand `src/docs/recipes/find-target.md` into the main playbook for locating user-mentioned documents/blocks.
- [x] Expand `src/docs/recipes/read-content.md` into the main playbook for reading located documents/blocks safely.
- [x] Expand `src/docs/recipes/connect-workspace.md` with first-run stop conditions and recovery guidance.
**Verification**: each recipe is self-sufficient for its scenario and contains decision flow, commands, success checks, and recovery.

### Phase 3: Clarify boundaries 🚧
- [x] Update `src/docs/cli-usage/extension.md` with a structured extension-vs-downstream-skill decision block.
- [x] Add concise human-facing substrate positioning to `README.md` without turning it into an Agent router.
**Verification**: README remains human-facing; extension docs expose the boundary as a scannable decision point.

### Phase 4: Validate 🚧
- [x] Run documentation structure checks (`sspec tool mdtoc`) on edited Markdown files.
- [x] Run `pnpm run typecheck`.
- [x] Review `git diff` for accidental scope expansion.
**Verification**: mdtoc succeeds, typecheck passes, diff matches spec scope.

### Feedback Tasks (→ [001-doc-path-resolution](./revisions/001-doc-path-resolution.md)) ✅
- [x] Clarify in `skills/siyuan-cli/SKILL.md` that referenced docs are accessed via `siyuan doc list/read` or the docs root printed by `siyuan --help`, not relative to the SKILL directory.
**Verification**: SKILL Bootstrap section contains explicit doc path resolution rule.

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 2/2 | ✅ |
| Phase 2 | 3/3 | ✅ |
| Phase 3 | 2/2 | ✅ |
| Phase 4 | 3/3 | ✅ |

**Recent**:
- 2026-05-11T19:20+08:00 — Updated plan after user directed implementation and clarified top-level docs are overloaded while recipes are too shallow.
- 2026-05-11T19:25+08:00 — Rewrote SKILL as single Agent router with first-response rules and recipe triggers.
- 2026-05-11T19:28+08:00 — Rewrote docs README as compact map/reference and removed duplicate full routing pressure.
- 2026-05-11T19:31+08:00 — Expanded find-target recipe into user-mentioned document/block resolution playbook.
- 2026-05-11T19:34+08:00 — Expanded read-content recipe into bounded reading and edit-preparation playbook.
- 2026-05-11T19:36+08:00 — Expanded connect-workspace recipe with stop conditions, smoke tests, and recovery guidance.
- 2026-05-11T19:38+08:00 — Replaced extension footnotes with a structured extension-vs-downstream-skill decision block.
- 2026-05-11T19:39+08:00 — Added concise human-facing substrate positioning to README after Quick Start.
- 2026-05-11T19:43+08:00 — Verified Markdown structure with mdtoc, ran typecheck, and reviewed diff scope.

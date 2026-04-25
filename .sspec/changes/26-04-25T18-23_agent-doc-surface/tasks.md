---
change: "agent-doc-surface"
updated: ""
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Doc runtime surface ✅
- [x] Add `src/core/docs.ts` for built-in docs root discovery, simple frontmatter parsing, listing, and name resolution.
- [x] Add `src/commands/doc.ts` and register it in `src/cli.ts`.
- [x] Update top-level help in `src/cli.ts` so docs root and shipped doc paths are disclosed.
**Verification**: `pnpm siyuan --help`, `pnpm siyuan doc --help`, `pnpm siyuan doc list`, and `pnpm siyuan doc read README.md` show real docs paths.

### Phase 2: Built-in docs content ✅
- [x] Update `src/docs/README.md` to point to recipes and `siyuan doc list`.
- [x] Add `src/docs/recipes/connect-workspace.md`, `src/docs/recipes/find-target.md`, `src/docs/recipes/read-content.md`, and `src/docs/recipes/edit-content.md`.
- [x] Update `src/docs/cli-usage/cli-overview.md` and `README.md` for the new doc/skill surface.
- [x] Rewrite `skills/siyuan-cli/SKILL.md` as thin bootstrap guidance.
**Verification**: docs reference the new command surface consistently and recipe files are discoverable via `doc list`.

### Phase 3: Simplified skill UX and tests ✅
- [x] Simplify `src/core/skills.ts` and `src/commands/skill.ts` to single-skill install/read/uninstall behavior with `--target <name> [--local]`.
- [x] Add or update tests covering doc listing/reading, skill install/read/uninstall behavior, and target normalization for `pi` / `.pi`.
- [x] Run targeted verification commands and test suite.
**Verification**: `pnpm siyuan skill --help`, `pnpm siyuan skill read`, `pnpm siyuan skill install --dry-run`, `pnpm siyuan skill install --target .pi --local --dry-run`, and `pnpm test` pass.

<!-- @RULE: Organize by phases. Each task <2h, independently testable.
Phase emoji: ⏳ pending | 🚧 in progress | ✅ done

### Phase 1: <name> ⏳
- [ ] Task description `path/file.py`
- [ ] Task description `path/file.py`
**Verification**: <how to verify this phase>

### Feedback Tasks (→ [NNN-description](./revisions/NNN-description.md))
Use this section for review/feedback tasks that still belong to the current change.

If accepted feedback changes scope/design:
- **Pre-gate** (spec not yet approved): update `spec.md` / `design.md` directly, then add tasks here.
- **Post-gate** (design baseline locked): create `revisions/NNN-*.md` FIRST, then update this section. Do NOT edit `spec.md` / `design.md`.

The section header MUST link the corresponding revision file (relative path).
If the work belongs in a new follow-up or replacement change, the agent MUST NOT put it here unless the user has first approved that direction via `@align`.
-->

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |

**Recent**:
- [2026-04-25T18:25+08:00] Change scaffolded; spec, design, and execution phases initialized.
- [2026-04-25T19:08+08:00] Implemented doc command, recipe docs, simplified skill targets, and passing test suite.

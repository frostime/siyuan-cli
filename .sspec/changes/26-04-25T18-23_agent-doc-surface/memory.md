# Memory: agent-doc-surface

**Updated**: <!-- ISO timestamp, minute precision -->

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `c017287f8b10b677fb25ecc18ca9ab86c0b806db`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## main
```

## State
Implementation is complete for docs discovery, recipe docs, simplified skill targets, and follow-up fixes from independent review.
Next step is user review of the finished behavior.

## Key Files
- `src/cli.ts` — top-level command registration and top-level help disclosure.
- `src/commands/skill.ts` — current skill CLI surface that still includes `list` and positional skill names.
- `src/core/skills.ts` — builtin skill discovery/install logic to simplify into single-skill behavior.
- `src/docs/README.md` — docs entry page that will add recipe-first guidance.
- `skills/siyuan-cli/SKILL.md` — bundled skill bootstrap content.
- `.sspec/tmp/26-04-25T18-09_siyuan-agent-doc-design.md` — pre-change design draft that informed the formal change.

## Knowledge
- [2026-04-25T18:25+08:00] [Decision] `siyuan doc` is convenience sugar; every docs help surface must disclose the real on-disk docs path for direct file reads.
- [2026-04-25T18:25+08:00] [Decision] `siyuan skill` targets a single bundled skill, so install/read/uninstall drop the redundant skill-name argument.
- [2026-04-25T18:30+08:00] [Decision] Skill target syntax is `--target <name> [--local]`; `agents` remains the default, `claude` remains a compatibility shortcut, and generic names normalize to leading-dot directories.
- [2026-04-25T18:30+08:00] [Constraint] Keep docs taxonomy flat: `README.md`, `recipes/`, existing `siyuan-guide/`, and existing `cli-usage/`.
- [2026-04-25T19:20+08:00] [Decision] SKILL content stays static and environment-agnostic; runtime placeholders and template substitution were removed.
- [2026-04-25T19:20+08:00] [Gotcha] Docs and bundled-skill path resolution must work from both source layout and packaged `dist/*` layout.

## Milestones
- [2026-04-25T18:25+08:00] Created change `agent-doc-surface` and captured formal spec/design/tasks for implementation.
- [2026-04-25T18:30+08:00] Refined skill target design to `--target <name> [--local]` with `pi`/`.pi` normalization.
- [2026-04-25T19:08+08:00] Completed implementation and validation for `doc` commands, recipe docs, skill target normalization, and updated tests.
- [2026-04-25T19:20+08:00] Applied review-driven fixes: packaged path resolution, static SKILL cleanup, docs consistency, and clearer edit recipe guidance.

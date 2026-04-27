# Memory: file-arch-feature-cohesion

**Updated**: 2026-04-27T14:36+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `refactor/code-arch`
- HEAD: `74654288240f0d0818636d33180dd2c8486ba09d`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## refactor/code-arch
A  .sspec/requests/26-04-27T13-25_change-file-arch.md
```

## State
Feature-cohesion migration executed (mv + import/doc patch) and build repaired.
Typecheck/build pass; tests still fail due to pre-existing permission-test API mismatch baseline.
Next step: user review and decision on whether to absorb test-fix work into this change or follow-up.

## Key Files
- `.sspec/changes/26-04-27T13-54_file-arch-feature-cohesion/spec.md` — problem/approach/key-change scope baseline
- `.sspec/changes/26-04-27T13-54_file-arch-feature-cohesion/design.md` — target structure + import graph + verification plan
- `.sspec/changes/26-04-27T13-54_file-arch-feature-cohesion/reference/path-migration-map.md` — authoritative old→new path mapping
- `src/cli.ts` — root command wiring and help-routing dependencies

## Knowledge
- [2026-04-27T13:57+08:00] [Decision] User selected Option B (full feature-cohesion), with execution strategy `mv first + import patch`.
- [2026-04-27T13:57+08:00] [Constraint] Keep external CLI command surface unchanged (`api/tool/workspace/doc/skill/approval`).
- [2026-04-27T13:57+08:00] [Gotcha] Side-effect registration imports must remain intact after move (`api/endpoints/index`, `tool/builtins/index`).
- [2026-04-27T13:59+08:00] [Constraint] Task scope includes markdown path reference updates in both `docs/**` and `src/docs/**`.
- [2026-04-27T14:36+08:00] [Gotcha] `pnpm test` currently fails for pre-existing test assumptions (`ContentAccessDeniedError` / `WorkspaceAccessDeniedError` named exports), also reproducible on baseline commit after dependency install.
- [2026-04-27T14:37+08:00] [Decision] Build-blocking import issue fixed: `src/tool/command.ts` side-effect import now points to `./builtins/index.js`.

## Milestones
- [2026-04-27T13:57+08:00] Created change `26-04-27T13-54_file-arch-feature-cohesion`, drafted spec/design, and produced deterministic path migration map for execution.
- [2026-04-27T13:59+08:00] Expanded planned reference patch scope from `docs/extending/**` to `docs/**` + `src/docs/**` scan.
- [2026-04-27T14:36+08:00] Completed migration execution: file moves, source/tests/docs path rewrites, legacy dir cleanup, and typecheck pass.
- [2026-04-27T14:37+08:00] Resolved build failure and verified `pnpm run build` success on migrated structure.

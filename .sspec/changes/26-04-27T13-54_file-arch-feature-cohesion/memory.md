# Memory: file-arch-feature-cohesion

**Updated**: 2026-04-27T13:57+08:00

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
Design baseline drafted for Option B feature-cohesion migration.
Path migration map has been frozen in `reference/path-migration-map.md`.
Next step: user gate approval on mapping contract, then execute mv + import patch.

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

## Milestones
- [2026-04-27T13:57+08:00] Created change `26-04-27T13-54_file-arch-feature-cohesion`, drafted spec/design, and produced deterministic path migration map for execution.
- [2026-04-27T13:59+08:00] Expanded planned reference patch scope from `docs/extending/**` to `docs/**` + `src/docs/**` scan.

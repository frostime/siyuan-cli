---
change: "extension-system"
updated: "2026-04-28T15:36+08:00"
---

# Memory: extension-system

**Updated**: <!-- ISO timestamp, minute precision -->

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `22c69ed34a0c9f17facf2fe06ab8561555596052`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
?? .sspec/requests/26-04-28T01-27_extension-system.md
```

## State
**Phase**: Plan (complete) → ready for Implement
**Handoff**: User will delegate implementation to a separate Code Writer Agent, then return for Review.

## Milestones
- [2026-04-28 04:18:25]: Request analyzed, clarified requirements through dialogue
- [2026-04-28 15:20:00]: Design completed — spec.md + design.md written and approved
- [2026-04-28 15:35:18]: Plan completed — tasks.md with 6 phases, 18 tasks

## Knowledge
- jiti chosen over pre-compile after analyzing staleness/complexity tradeoffs
- Cache strategy: 3-layer model (piggyback write on execution, explicit `extension cache`, read-only discovery with [uncached] degradation). Derived from dialectical analysis of implicit cache pros/cons.
- Schema cache carries `_version: 1` for future migration
- tsconfig paths auto-detected from `import.meta.url` — avoids requiring `npm install` in extensions dir
- `.gitignore` auto-generated to exclude `node_modules/` and `*.schema.json`
- `registerExtension()` uses warn+skip (not throw) for ID conflicts
- tsdown already has `dts: true` — need to verify `dist/shared/schema.d.mts` is actually emitted with `unbundle: true`
- Package currently has no `exports`/`types`/`main` fields — all need adding
- Extensions load lazily (only in api/tool subcommands) — other commands unaffected

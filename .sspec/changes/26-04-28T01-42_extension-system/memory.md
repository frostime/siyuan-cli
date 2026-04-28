---
change: "extension-system"
updated: "2026-04-28T15:36+08:00"
---

# Memory: extension-system

**Updated**: 2026-04-28T20:18+08:00

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
**Phase**: Implement complete → ready for Review
**Handoff**: Code implementation finished; user can take this branch to Claude for review.

## Milestones
- [2026-04-28 04:18:25]: Request analyzed, clarified requirements through dialogue
- [2026-04-28 15:20:00]: Design completed — spec.md + design.md written and approved
- [2026-04-28 15:35:18]: Plan completed — tasks.md with 6 phases, 18 tasks
- [2026-04-28 19:19:00]: Implementation completed — extension modules, lazy loading, package exports, tests, and manual E2E verification finished
- [2026-04-28 20:18:00]: Review-alignment fixes completed — tool conflict handling now truly skips conflicting extensions; discovery list output and cache write semantics aligned with design

## Knowledge
- jiti chosen over pre-compile after analyzing staleness/complexity tradeoffs
- Cache strategy: 3-layer model (piggyback write on execution, explicit `extension cache`, read-only discovery with [uncached] degradation). Derived from dialectical analysis of implicit cache pros/cons.
- Schema cache carries `_version: 1` for future migration
- tsconfig paths auto-detected from `import.meta.url` — avoids requiring `npm install` in extensions dir
- `.gitignore` auto-generated to exclude `node_modules/` and `*.schema.json`
- `registerExtension()` uses warn+skip (not throw) for ID conflicts
- `tsdown` needed an explicit `src/shared/schema.ts` entry to emit `dist/shared/schema.d.mts` for the `./schema` export
- `citty` static subcommand resolution cannot natively expose dynamic extension help, so top-level CLI help interception uses raw argv to render `siyuan api|tool <id> --help`
- Endpoint extensions are fully supported for discovery/registration/cache; live execution still depends on a real SiYuan kernel because endpoint schemas do not define an executable hook like tools do
- Review alignment fixes: `tool` conflict path no longer executes skipped extensions; `tool list`/`api list` now surface uncached/stale discovery state; `writeSchemaCache()` now owns its non-fatal warn-and-continue behavior internally
- Extensions load lazily (only in api/tool subcommands) — other commands unaffected

---
change: "extension-system"
updated: "2026-04-28T21:48+08:00"
---

# Memory: extension-system

## State
**Phase**: Review (in progress)
**Status**: Implementation done, reviewer fixes applied, pending second audit by separate agent.

## Milestones
- 2026-04-28 01:27: Request created
- 2026-04-28 01:42: Change created, Clarify + Design completed
- 2026-04-28 15:36: Plan completed — 6 phases, 18 tasks
- 2026-04-28 ~19:00: Implementation by Code Writer Agent — 16 files, +1492/−330
- 2026-04-28 21:48: Review by Design Agent — 2 issues found and fixed (revision 001)

## Knowledge
- jiti chosen over pre-compile after analyzing staleness/complexity tradeoffs
- Cache strategy: 3-layer model (piggyback write on execution, explicit `extension cache`, read-only discovery with [uncached] degradation)
- Schema cache carries `_version: 1` for future migration
- tsconfig paths auto-detected from `import.meta.url`
- `.gitignore` auto-generated to exclude `node_modules/` and `*.schema.json`
- `registerExtension()` uses warn+skip (not throw) for ID conflicts
- tsdown `dts: true` + `unbundle: true` generates `dist/shared/schema.d.mts` correctly
- Package `exports` with `./schema` subpath works
- **citty `subCommands` supports `Resolvable<SubCommandsDef>`** — lazy function returning the dict. This is the key to supporting dynamic extensions while keeping `--help` enumeration.
- jiti `import()` type: `{ default?: true }` only — cannot pass `false`. Omit the option to get namespace import behavior.
- Implementation agent had good improvements (CliError, extension discovery logic) but made an unauthorized architectural change (positional dispatch replacing subCommands). Revision 001 preserves the good parts and reverts the structural regression.
- Test fixtures left in `~/.config/siyuan-cli/extensions/` by the implementing agent (hello.ts, resolve-path.ts, echo.ts, bad.ts) — not in repo, user's local env only.

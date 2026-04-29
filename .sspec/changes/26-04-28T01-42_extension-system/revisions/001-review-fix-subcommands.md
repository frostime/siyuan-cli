---
revision: 001
title: "review-fix-subcommands"
created: 2026-04-28
trigger: "Review phase — reviewer audit"
---

# Revision 001: review-fix-subcommands

## Reason

Implementation agent rewrote `api/command.ts` and `tool/command.ts` from citty `subCommands` pattern to a manual positional-dispatch pattern. This caused:

1. `siyuan tool --help` / `siyuan api --help` no longer enumerates individual tools/endpoints as subcommands — only shows generic `TARGET` placeholder
2. `cli.ts` added raw `process.argv` parsing as a workaround for help routing

Additionally, `loader.ts` had a TypeScript error: `jiti.import()` called with `{ default: false }` but the type only accepts `{ default?: true }`.

## Spec Impact

None — the spec called for "lazy loading hook", not command restructuring. This revision restores the intended behavior.

## Design Impact

None — design is unchanged. The fix uses citty's `Resolvable<SubCommandsDef>` (`subCommands: () => { ... }`) to lazily resolve subcommands, which satisfies both dynamic extension support and subcommand enumeration.

## Task Impact

No new tasks. All fixes applied directly:

- `src/extension/loader.ts`: Remove `{ default: false }` from `jiti.import()` call
- `src/tool/command.ts`: Restore `subCommands` pattern with lazy resolver, preserve extension discovery/cache logic
- `src/api/command.ts`: Same restoration
- `src/cli.ts`: Remove `process.argv` manual parsing, restore original `customShowUsage` structure

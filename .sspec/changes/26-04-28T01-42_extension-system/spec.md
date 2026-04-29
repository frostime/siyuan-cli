---
name: extension-system
status: PLANNING
change-type: single
created: 2026-04-28 01:42:27
reference:
- source: .sspec/requests/26-04-28T01-27_extension-system.md
  type: request
  note: Linked from request
- source: .sspec/changes/26-04-28T01-42_extension-system/revisions/001-review-fix-subcommands.md
  type: revision
  note: "Review fix: restore subCommands pattern + jiti type error"
---

# extension-system

## Problem Statement

siyuan-cli's endpoints and tools are hardcoded at build time (`src/api/endpoints/index.ts`, `src/tool/builtins/index.ts`). Users who need custom kernel API wrappers or workflow tools must fork the repo. This blocks adoption in agent pipelines where teams need org-specific tools without maintaining a fork.

## Proposed Solution

### Approach

Add a user extension system at `~/.config/siyuan-cli/extensions/{apis,tools}/`. Extensions are `.ts` files loaded via `jiti` at runtime, with a **schema cache** strategy that separates discovery from execution:

- **Execution** (`siyuan api/tool <id>`): jiti-imports `.ts` → runs → **piggyback writes** `schema.json` as zero-cost side-effect
- **Discovery** (`list`, `--help`): reads cached `schema.json` only — pure read, no jiti, no side effects
- **Explicit cache** (`siyuan extension cache`): batch-imports all extensions and writes all `schema.json`

Cache design principle: **single write point** (execution post-hook), discovery paths read-only with graceful degradation (`[uncached]` + hint).

**Why jiti**: A separate build step creates staleness problems (edit `.ts`, forget to build). jiti solves this transparently — write and run. The schema cache ensures non-execution paths stay fast.

### Key Change

**Feat A: Extension Loader** — New `src/extension/` module that scans extension directories, manages schema cache (mtime-based staleness, versioned cache format), and dynamically loads `.ts`/`.mjs` files via jiti/native import.

**Feat B: Registry Integration** — `EndpointRegistry` and `ToolRegistry` gain a `registerExtension()` path with conflict detection (warn + skip on ID collision with builtins).

**Feat C: Lazy Loading Hook** — `api/command.ts` and `tool/command.ts` call the extension loader only when the subcommand is invoked (not at CLI startup). Execution path piggybacks cache write after successful import.

**Feat D: `siyuan extension` Subcommand** — New CLI subcommand:
- `init` — scaffold extension directory with tsconfig.json (auto-detected paths), `.gitignore`, example files
- `list` — show discovered extensions with cache status (read-only, hints for uncached)
- `cache` — batch-generate all schema.json files without executing `run()`

**Feat E: Type Exports** — Fix `package.json` exports/types fields so `import type { ToolSchema } from '@frostime/siyuan-cli/schema'` works for extension authors.

### Scope Summary

| File | Change |
|------|--------|
| `src/extension/loader.ts` | **New** — scan dirs, jiti import, cache read/write, mtime check |
| `src/extension/cache.ts` | **New** — versioned schema.json serialization/deserialization |
| `src/extension/command.ts` | **New** — `siyuan extension` subcommand (init/list/cache) |
| `src/extension/init.ts` | **New** — scaffolding logic (tsconfig with auto-detected paths, .gitignore, examples) |
| `src/api/registry.ts` | **Modify** — add `registerExtension()` with conflict handling |
| `src/tool/registry.ts` | **Modify** — add `registerExtension()` with conflict handling |
| `src/api/command.ts` | **Modify** — call extension loader before dispatch |
| `src/tool/command.ts` | **Modify** — call extension loader before dispatch |
| `src/cli.ts` | **Modify** — add `extension` subcommand |
| `src/workspace/paths.ts` | **Modify** — add `getExtensionDir()` |
| `package.json` | **Modify** — add `exports`/`types` fields, add `jiti` dependency |

### Design Reference

→ Detailed technical design in [design.md](./design.md)

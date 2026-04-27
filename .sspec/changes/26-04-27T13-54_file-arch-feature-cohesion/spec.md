---
name: file-arch-feature-cohesion
status: PLANNING
change-type: single
created: 2026-04-27 13:54:28
reference:
- source: .sspec/requests/26-04-27T13-25_change-file-arch.md
  type: request
  note: Linked from request
---

# file-arch-feature-cohesion

## Problem Statement
Current command and domain code are split across `src/commands/`, `src/core/`, and `src/utils/`, so one feature (especially workspace/api/tool) requires cross-directory jumps to understand or change.

Observed impact:
- Workspace flow spans at least 5 files across 3 directories (`commands/workspace.ts`, `core/config.ts`, `utils/paths.ts`, `utils/project-config.ts`, `utils/diagnostics.ts`), increasing change friction.
- Command entrypoints are mixed (`src/commands/*` and `src/approval/command.ts`), so the architecture communicates two competing organization styles.
- `utils/` contains feature-owned logic, reducing boundary clarity and making future placement decisions inconsistent.

## Proposed Solution

### Approach
Adopt **Option B (feature-cohesion)** with a deterministic path migration map, then execute in two mechanical steps: `mv` first, import patch second. The change is structural only; public CLI behavior and command contracts stay unchanged.

The target layout groups code by feature (`api`, `tool`, `workspace`, `doc`, `skill`) and keeps only truly cross-feature modules under `shared/`. Existing cohesive modules (`approval/`, bundled `docs/`, bundled `skills/`) stay in place.

### Key Change
**Refactor A: Feature-root migration**
Move command entry files and owning internals into feature directories (`src/api`, `src/tool`, `src/workspace`, `src/doc`, `src/skill`) with fixed old→new path rules.

**Refactor B: Shared module extraction**
Move cross-feature primitives from `core/` + `utils/` into `src/shared/` (`schema`, `errors`, `client`, `permission`, `argv`, `output`, `sql`).

**Refactor C: Catalog co-location**
Move endpoint schemas from `src/apis/**` to `src/api/endpoints/**` and builtin tool schemas from `src/tools/**` to `src/tool/builtins/**`.

**Refactor D: Import and reference patch**
Apply mechanical import rewrites in source/tests/docs according to the migration map, keeping side-effect registration imports functionally identical.

**Refactor E: Legacy directory cleanup**
Remove emptied legacy directories (`commands`, `core`, `utils`, `apis`, `tools`) after typecheck/test verification.

### Scope Summary
| Area | Change |
|---|---|
| `src/` architecture | Reorganize to feature-first structure with deterministic path map |
| `src/cli.ts` | Update subcommand and helper imports to new locations |
| `src/**` imports | Mechanical path rewrites only, no runtime semantics change |
| `tests/**` imports | Update module paths for moved files |
| `docs/**` and `src/docs/**` path references | Refresh source path examples to match new structure |

### Design Reference
→ Detailed migration map and execution blueprint: [design.md](./design.md)

And migration map: "./reference/path-migration-map.md"

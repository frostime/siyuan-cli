---
name: code-quality-regularization
status: PLANNING
change-type: single
created: 2026-04-29 22:51:00
reference: null
---

# code-quality-regularization

## Problem Statement

Two core modules have accumulated structural complexity that exceeds the complexity of the problems they solve:

1. **`src/shared/schema.ts` (~600 lines) mixes type definitions with a full pointer-path mini-DSL.** The file contains JSONSchema types, permission model types, endpoint/tool schema types, AND a complete query language (compile → traverse → filter). Every module in the project imports this file, but most only need the types. The DSL implementation buries the type surface under ~200 lines of traversal logic, making the file's logical structure visually unrecoverable.

2. **`src/workspace/config.ts` (~500 lines) handles config I/O, workspace resolution, token resolution, and validation/smoke testing.** These are different change reasons packed into one file. Adding a new workspace resolution source or a new config field requires navigating unrelated code.

## Proposed Solution

### Approach

**KISS constraint: every change MUST reduce complexity. Refuse any refactoring that introduces new abstraction layers, new indirection, or new concepts.** The goal is surgical decomposition — split overloaded files along existing responsibility seams. No new design patterns, no new abstraction vocabulary.

Each fix is independent and can be implemented in any order. Neither requires new interfaces, base classes, or factories.

### Guiding Principles

1. **Split only where the seam already exists.** If two concerns in a file are already separated by section comments and have no shared mutable state, they are candidates for file split. Do not invent new seams.

2. **Move code, don't rewrite it.** When splitting a file, copy functions verbatim to the new file and update imports. Resist the urge to "improve while you're at it."

3. **No new abstraction layers.** Do not introduce a `Registry<T>` generic base class, a `ConfigProvider` interface, or any other abstraction. If the duplication is tolerable and the pieces don't change together, leave it duplicated.

4. **Preserve all public APIs.** Import paths consumed by other modules MUST NOT change. Re-export from the original file if needed to maintain backward compatibility.

5. **Prefer file extraction over in-file sectioning when the extracted unit is independently meaningful.** `pointer-path.ts` is a coherent traversal/filtering engine; `resolve.ts` is a coherent workspace resolution pipeline. Both are meaningful standalone units.

### Key Change

**Fix A: Decompose `src/shared/schema.ts`**
- Extract pointer-path DSL (`compilePointerPath`, `runPointerGet`, `evaluatePointerPath`, `runPointerFilterTerminal`, `isTerminalFilterCompatiblePointerPath`, `pointerPathRoot`, `PointerPathShapeError`, `PathOp`, `ShapePolicy`, `STRICT_POINTER_POLICY`, `rejectByPolicy`) into `src/shared/pointer-path.ts`.
- Re-export all moved symbols from `schema.ts` to preserve existing import paths.
- `schema.ts` becomes mostly type definitions, plus small schema-adjacent helpers (`deriveEndpointId`, `isHighRisk`, `resolvePermissionEffect`, `validateBehaviorRaw`).

**Fix B: Decompose `src/workspace/config.ts`**
- Extract workspace resolution chain (`resolveWorkspace`, `resolveEffectiveWorkspace`, `materializeWorkspace`, `WorkspaceResolutionSource`, `ResolvedWorkspace`, `MaterializedWorkspace`, `WorkspaceOverrides`) into `src/workspace/resolve.ts`.
- Move `resolveTokenSource` into `resolve.ts` as an internal helper — but **do NOT create a separate `token.ts`**. Keep `TokenSource` exported from `config.ts` because `WorkspaceEntry` uses it.
- `config.ts` retains: types (`AppConfig`, `WorkspaceEntry`, `TokenSource`), `loadConfig`/`saveConfig`, `normalizeConfig`, `renderConfigYaml`, `migrateLegacyWindowsConfig`, `resolveEffectiveBehavior`, `validateBehavior`/`validateBehaviorRaw`, `normalizeBehavior`.
- Re-export moved symbols from `config.ts`.

### Scope Summary

| File | Change |
|------|--------|
| `src/shared/pointer-path.ts` | **New** — pointer-path DSL extracted from schema.ts |
| `src/shared/schema.ts` | Remove DSL code; re-export from pointer-path.ts |
| `src/workspace/resolve.ts` | **New** — workspace resolution chain extracted from config.ts (includes token resolution as internal helpers) |
| `src/workspace/config.ts` | Remove extracted code; re-export moved symbols |

### What Stays Unchanged

- **`api/command.ts` module-level mutable state**: Grouping 3 `let` variables into an object does not change the complexity model (global state still exists). No change.
- **`cli.ts` if-chain**: 5 branches, direct `if` is more readable than a lookup map at current scale. No change.
- **`guard.ts` ExecuteOptions**: 10 fields is not enough to justify nested grouping. No change.
- **EndpointRegistry and ToolRegistry duplication**: Don't change together; extracting a shared base would add an abstraction layer for no present benefit. Leave as-is.
- **Permission engine two-phase model**: Complexity is justified by current security model. No change.
- **Approval system architecture**: Well-factored, matches problem complexity. No change.
- **All public import paths**: Re-exports ensure zero breaking changes for consumers.

### Design Reference

→ Detailed technical design in [design.md](./design.md)

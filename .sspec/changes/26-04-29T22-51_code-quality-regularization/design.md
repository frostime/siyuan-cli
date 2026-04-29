# design.md — code-quality-regularization

## Structural Blueprint: Before → After

```
BEFORE:
src/shared/
  schema.ts          ← ~600 lines: types + DSL + helpers

src/workspace/
  config.ts          ← ~500 lines: types + I/O + resolution + token + validation + migration


AFTER:
src/shared/
  schema.ts          ← ~250 lines: pure types + deriveEndpointId + isHighRisk
  pointer-path.ts    ← ~200 lines: DSL (compile, traverse, filter, errors)

src/workspace/
  config.ts          ← ~250 lines: types + I/O + migration + smoke test + behavior validation
  resolve.ts         ← ~150 lines: workspace resolution chain (includes token helpers)
```

---

## Fix A: Pointer-Path DSL Extraction

### What moves

All symbols related to pointer-path parsing, traversal, and filtering move to `src/shared/pointer-path.ts`:

- `PointerPath` (type alias)
- `PathOp` (type)
- `ShapePolicy` (interface)
- `STRICT_POINTER_POLICY` (const)
- `PointerPathShapeError` (class)
- `compilePointerPath`
- `pointerPathRoot`
- `runPointerGet`
- `evaluatePointerPath`
- `isTerminalFilterCompatiblePointerPath`
- `runPointerFilterTerminal`
- `rejectByPolicy` (internal helper)

### What stays in schema.ts

- All JSONSchema types
- All permission model types (`PermissionRule`, `PermissionConfig`, etc.)
- All behavior model types (`BehaviorConfig`, `ResolvedBehaviorConfig`, etc.)
- `EndpointSchema`, `ToolSchema`, `RegisteredEndpoint`, `EndpointFormatContext`
- `GlobalArgs`, `ToolResult`, `ToolContext`
- `deriveEndpointId`
- `isHighRisk`
- `resolvePermissionEffect`
- `validateBehaviorRaw`

### Re-export in schema.ts

```typescript
// src/shared/schema.ts — bottom of file
export {
    PointerPath,
    PointerPathShapeError,
    PathOp,
    ShapePolicy,
    STRICT_POINTER_POLICY,
    compilePointerPath,
    pointerPathRoot,
    runPointerGet,
    evaluatePointerPath,
    isTerminalFilterCompatiblePointerPath,
    runPointerFilterTerminal
} from './pointer-path.js';
```

### Dependency direction

```
pointer-path.ts  →  (no internal deps)
schema.ts        →  pointer-path.ts  (re-export only)
guard.ts         →  schema.ts        (unchanged)
permission.ts    →  schema.ts        (unchanged)
```

No consumer needs to change its import statement.

---

## Fix B: Config Decomposition

### What moves to `src/workspace/resolve.ts`

- Types: `WorkspaceResolutionSource`, `ResolvedWorkspace`, `MaterializedWorkspace`, `WorkspaceOverrides`
- Functions: `resolveWorkspace`, `resolveEffectiveWorkspace`, `materializeWorkspace`
- Internal helper: `resolveTokenSource`
- Imported type: `TokenSource` from `config.ts`

### What stays in config.ts

- Types: `AppConfig`, `WorkspaceEntry`, `TokenSource` (still exported for config file consumers)
- Functions: `loadConfig`, `saveConfig`, `normalizeConfig`, `renderConfigYaml`, `migrateLegacyWindowsConfig`
- Functions: `resolveEffectiveBehavior`, `normalizeBehavior`
- Functions: `validateBehavior`, `validateBehaviorRaw`, `runConfigSmokeTest`, `warnRulesSmoke`
- Constants: `SCHEMA_VERSION`, `BUILT_IN_BEHAVIOR`

### Why token.ts is NOT a separate file

`resolveTokenSource` + `TokenSource` type = ~30 lines. The cost of a standalone file (import linkage, filesystem noise, reader context switching) exceeds the benefit. Keeping it as an internal helper inside `resolve.ts` is the right granularity.

`TokenSource` type is still exported from `config.ts` because it's part of `WorkspaceEntry` (the config file schema). `resolve.ts` imports it from `config.ts`. `resolveTokenSource` is private to `resolve.ts`.

### Re-exports in config.ts

```typescript
// src/workspace/config.ts — bottom of file
export {
    resolveWorkspace,
    resolveEffectiveWorkspace,
    materializeWorkspace,
    type ResolvedWorkspace,
    type MaterializedWorkspace,
    type WorkspaceOverrides,
    type WorkspaceResolutionSource
} from './resolve.js';
```

### Dependency direction

```
resolve.ts   →  config.ts (types), project-config.ts, resolver.ts
config.ts    →  resolve.ts (re-export)
```

All external consumers (`guard.ts`, `command.ts`, `tool/registry.ts`, etc.) continue importing from `config.ts`.

---

## Verification Strategy

After each fix:

1. `pnpm run typecheck` — MUST pass with zero new errors
2. `pnpm run build` — MUST produce identical output
3. `pnpm run test` — MUST pass (existing tests cover the touched modules)
4. Manual: `pnpm run siyuan api list` — MUST produce identical output
5. Manual: `pnpm run siyuan api query.sql "SELECT id FROM blocks LIMIT 1"` — MUST work

No new tests needed — these are pure structural moves, not behavioral changes.

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Re-export moved symbols from original files | Preserves all existing import paths; zero consumer changes |
| No `Registry<T>` generic | EndpointRegistry and ToolRegistry don't change together; extraction adds abstraction for no present benefit |
| No nested `ExecuteOptions` grouping | Would change every call site for 10 fields; not worth the churn |
| No `token.ts` standalone file | ~30 lines; file system noise > benefit. Internal helper in `resolve.ts` is right granularity |
| No `cli.ts` lookup map | 5 branches, direct `if` is more readable than indirection at current scale |
| No `api/command.ts` state grouping | Wrapping 3 vars in an object doesn't change the complexity model; zero real benefit |
| Extract pointer-path.ts rather than section markers | The DSL is ~200 lines of implementation with its own error types; it's a coherent unit |
| Extract resolve.ts rather than section markers | These are already self-contained functions with clear boundaries; extraction reduces file from ~500 to ~250 lines |

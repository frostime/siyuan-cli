---
revision: 1
date: 2026-04-27T22:23:16
trigger: review-feedback
---

# split-resolution-model-and-drop-cache

## Reason

Review feedback surfaced three design issues after implementation:

1. `resolveWorkspace()` / `resolveEffectiveWorkspace()` becoming async pushed promise handling into broad call chains and created awkward type edges (`WorkspaceEntry.baseUrl?: string` vs `ClientConfig.baseUrl: string`).
2. TTL cache has weak value in a single-shot CLI process model because each command starts a fresh process. The main benefit would only exist inside a single invocation, and even there the same workspace is usually materialized once.
3. VSCode type errors around workspace resolution showed the async boundary was placed too high in the stack.

## Changes

### Spec Impact

- Keep `baseUrl` and `workspaceDir` as parallel connection strategies.
- Drop the TTL cache from the design.
- Narrow the async boundary:
  - workspace *selection* stays synchronous
  - workspace *materialization* (turning `workspaceDir` into concrete `baseUrl`) is asynchronous

### Design Impact

Adopt a two-phase model:

```ts
resolveWorkspace(...) / resolveEffectiveWorkspace(...)
  -> ResolvedWorkspace   // sync, may carry baseUrl or workspaceDir

materializeWorkspace(resolved)
  -> MaterializedWorkspace // async, always has concrete baseUrl
```

Concrete effects:

- `ResolvedWorkspace` remains the policy / provenance carrier used by guard and permission layers.
- `MaterializedWorkspace` is the network-ready shape for `SiyuanClient`.
- `materializeWorkspace()` calls `resolveWorkspaceDirToBaseUrl()` only when `baseUrl` is absent.
- Cache is removed from the decision baseline; fresh resolution is used for correctness and simplicity.

### Task Impact

- Replace the previous broad async propagation model with the split `resolve` / `materialize` model.
- Rework call sites in:
  - `src/workspace/command.ts`
  - `src/api/command.ts`
  - `src/tool/registry.ts`
- Re-run typecheck to confirm the VSCode-reported type edge is resolved.

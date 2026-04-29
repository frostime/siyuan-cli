# Revision 001: Raw API Access & Source Bootstrapping

**Trigger**: Post-implementation review — user identified gaps in extension authoring experience.
**Date**: 2026-04-28

---

## 1. Problem: callEndpointRaw is Registry-Bound

`ToolContext.callEndpointRaw` currently takes an `id: string` and looks it up in `EndpointRegistry` before calling `client.call()`. This defeats its purpose: Tool extensions that need to call kernel APIs **not yet registered** in siyuan-cli cannot use it.

**Evidence**: `rg callEndpointRaw` across `src/` shows **zero call sites** (only definition + type declaration). Safe to change.

## 2. Analysis: Massive Uncovered Kernel API Surface

Inspected `siyuan-note/siyuan/kernel/api/router.go` via `gh` CLI.

**Findings**:
- Total registered endpoints: **~400+**
- siyuan-cli built-in coverage: **~60 endpoints** (asset, attr, block, convert, export, file, filetree, network, notebook, notification, query, search, sqlite, system, template)
- **Completely uncovered domains** (~340 endpoints): ai, av (attribute view / database), bazaar, bookmark, broadcast, clipboard, graph, history, import, inbox, repo, riff (flashcards), setting, snippet, storage, sync, tag, ui

**Implication**: Extension authors will routinely encounter kernel APIs that siyuan-cli does not wrap. The current `callEndpointRaw` is unusable for this case.

## 3. Decision: Change callEndpointRaw Signature

**Before**:
```ts
callEndpointRaw: <T = unknown>(id: string, payload: unknown) => Promise<T>;
// Internally: endpointRegistry.get(id) -> client.call(entry.schema.endpoint, payload)
```

**After**:
```ts
callEndpointRaw: <T = unknown>(endpoint: string, payload: unknown) => Promise<T>;
// Internally: client.call(endpoint, payload) — no registry lookup
```

**Rationale**:
- Zero existing callers → no breakage.
- Alpha stage — API contract is still fluid.
- Name "Raw" already signals "skip framework checks"; requiring registry lookup contradicts that signal.
- The raw `SiyuanClient.call(endpoint, payload)` already exists and is the natural target.

## 4. Decision: Source Bootstrapping Over Document Exhaustion

Rather than expanding documentation to enumerate every internal type and pattern, the docs should **expose source locations** so agents can self-discover.

**Principle**: CLI docs = map, not atlas. Point to the source code shipped with the package.

**Source locations to document**:

| File | What it contains |
|------|-----------------|
| `src/shared/schema.ts` | `EndpointSchema`, `ToolSchema`, `ToolContext`, `GlobalArgs` type definitions |
| `src/shared/client.ts` | `SiyuanClient` — HTTP client with `call(endpoint, payload)` |
| `src/api/registry.ts` | `EndpointRegistry` — endpoint registration and lookup |
| `src/tool/registry.ts` | `ToolRegistry`, `createToolContext` — assembles `ToolContext` at runtime |

**Kernel API discovery**:
- Primary: `https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go`
- Alternative: `gh api repos/siyuan-note/siyuan/contents/kernel/api/router.go` for local analysis

## 5. Impact on Spec

| Spec Item | Impact |
|-----------|--------|
| Fix A (type paths) | None — tsconfig change is sufficient |
| Fix B (visual separation) | None — grouped help is complete |
| Fix C (documentation) | **Expand**: `extension.md` needs two new sections: (1) "Calling kernel APIs from a Tool" with `callEndpoint` / `callEndpointRaw` / `client` examples, (2) "Source reference" listing the key source files |
| **New**: Raw API access | Add `callEndpointRaw` signature change to `src/shared/schema.ts` and `src/tool/registry.ts` |

## 6. Impact on Tasks

Append to `tasks.md` Phase 4 (or create Phase 5):

- `src/shared/schema.ts` — update `ToolContext.callEndpointRaw` signature (`endpoint: string`)
- `src/tool/registry.ts` — update `callEndpointRaw` implementation (direct `client.call()`)
- `src/docs/extension.md` — add "Calling kernel APIs from a Tool" section
- `src/docs/extension.md` — add "Source reference" section
- `skills/siyuan-cli/SKILL.md` — add source bootstrapping capability note
- Regression: verify `pnpm run build && pnpm run typecheck` still pass

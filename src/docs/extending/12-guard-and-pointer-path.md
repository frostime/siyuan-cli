---
title: Guard and PointerPath
slug: guard-and-pointer-path
summary: payloadTargets, response, filterResponse, and the PointerPath grammar shared by both.
---

# Guard and PointerPath

GATE: every endpoint that touches user content must declare a guard. Use this as the reference.

## Three guard shapes

### 1. `payloadTargets` — pre-call permission check

```ts
guard: {
  payloadTargets: [
    { path: "id", kind: "id", access: "read" },
    { path: "refIDs[*]", kind: "id", access: "write" },
  ],
}
```

Before the kernel is called, `applyPayloadGuard()` evaluates each `path` against the payload and passes every resolved string value to `engine.checkContentRef({kind, value, access})`.

### 2. `response` — declarative post-call filter

```ts
guard: {
  response: {
    itemsAt: "blocks[*]",
    fieldMap: { id: "id", path: "path", notebook: "box" },
  },
}
```

After the kernel returns, `applyResponseGuard()` evaluates `itemsAt` to extract items, filters them through `engine.filterItems()` with the given field map, writes the kept items back in-place, and emits one `CONTENT_FILTERED` warning on stderr if anything was removed.

### 3. `filterResponse` — imperative escape hatch

```ts
guard: {
  filterResponse: (response, engine) => {
    const r = response as { data?: { files?: Array<...> } };
    const { kept } = engine.filterItems(r.data?.files ?? [], (f) => ({ ... }));
    if (r.data?.files) r.data.files = kept;
    return response;
  },
}
```

Use only when the response shape needs logic that the declarative form can't express — typically nested write-back, conditional field location, or partial rejection of a wrapped object. See `src/apis/filetree/listDocsByPath.ts`.

## PointerPath grammar

Both `payloadTargets[*].path` and `response.itemsAt` use the same minimal syntax.

```text
PointerPath ::= Segment ( "." Segment )*
Segment     ::= Name ("[*]")?
              | "[*]"              // root array expansion (first segment only)
Name        ::= [A-Za-z_][A-Za-z0-9_]*
```

| Form | Meaning |
|---|---|
| `id` | top-level string property |
| `ids[*]` | top-level array, each element a string |
| `blocks[*]` | top-level array of objects |
| `blocks[*].id` | string field of each element |
| `[*]` | root itself is an array |
| `[*].id` | string field of each root-array element |
| `data.blocks[*]` | array two segments deep |
| `data.blocks[*].id` | string field two-deep-then-array |

**Not supported** (fail-loud at compile time): predicates, recursion, slices, `$`, quoted keys, multiple array expansions in filter-write-back context.

## Shape policy

Default policy `STRICT_POINTER_POLICY`:

- missing key → `[]` (skip silently)
- non-array where array expected → throw `PointerPathShapeError`
- non-object before a key → skip (allows gracefully handling heterogeneous arrays)

This policy applies to payload guards (fail-loud on malformed user input) and response guards (fail-loud on unexpected kernel response shape — a feature, not a bug: unknown shape means permission filter may silently miss items, so we refuse the response).

## `fieldMap` — which response field is which ResourceKind

```ts
fieldMap: {
  id: "id",           // the item's block id lives in item.id
  path: "path",       // the item's SiYuan path lives in item.path
  notebook: "box",    // the item's notebook id lives in item.box
}
```

Only the three keys `id | path | notebook` are recognized. Values name the property on each extracted item. Omit keys you don't have — the engine works with whichever subset is provided.

## Choosing which guard to use

```text
is the field a user-addressed resource (id / path / notebook / workspace-path)?
  └── yes → payloadTargets

does the endpoint return a list of content items that should be permission-filtered?
  ├── items at a simple pointer path (including `[*]`) and item fields are flat? → response
  └── items nested in a complex wrapper, or wrapper needs partial write-back? → filterResponse

global-read endpoint with no payload that resolves to a resource?
  └── response or filterResponse is REQUIRED (startup validation enforces)
```

## Examples from the repo

### Scalar payload target

```ts
// src/apis/block/getBlockKramdown.ts
guard: {
  payloadTargets: [
    { path: "id", kind: "id", access: "read" },
  ],
},
```

### Array payload target

```ts
// src/apis/block/transferBlockRef.ts
guard: {
  payloadTargets: [
    { path: "fromID", kind: "id", access: "write" },
    { path: "toID", kind: "id", access: "write" },
    { path: "refIDs[*]", kind: "id", access: "write" },   // every element checked
  ],
},
```

### Root-array response filter

```ts
// src/apis/query/sql.ts
guard: {
  response: {
    itemsAt: "[*]",
    fieldMap: { id: "id", path: "path", notebook: "box" },
  },
},
```

### Nested-array response filter

```ts
// src/apis/search/fullTextSearchBlock.ts
guard: {
  response: {
    itemsAt: "blocks[*]",
    fieldMap: { id: "id", path: "path", notebook: "box" },
  },
},
```

### Imperative fallback for wrapped + write-back response

```ts
// src/apis/filetree/listDocsByPath.ts
guard: {
  payloadTargets: [
    { path: "notebook", kind: "notebook", access: "read" },
    { path: "path", kind: "path", access: "read" },
  ],
  filterResponse: (response, engine) => {
    const r = response as { files?: Array<...>; data?: { files?: Array<...>; box?: string } };
    const files = r.data?.files ?? r.files ?? [];
    const box = r.data?.box;
    const { kept } = engine.filterItems(files, (f) => ({
      id: typeof f.id === "string" ? f.id : undefined,
      path: typeof f.path === "string" ? f.path : undefined,
      notebook: typeof f.box === "string" ? f.box : box,
    }));
    if (r.data?.files) r.data.files = kept;
    else if (r.files) r.files = kept;
    return response;
  },
},
```

## Common mistakes

- writing `{ field: "id" }` → legacy shape, will not type-check; use `{ path: "id" }`
- writing `{ path: "ids", kind: "id" }` for an array field → only checks the array itself (non-string → throws); use `ids[*]`
- picking `kind: "id"` for a value that is actually an hpath → guard resolves hpath as a block id and fails; leave a comment and skip guarding that field (see `getIDsByHPath.ts`)
- declaring `itemsAt: "data.blocks[*]"` while every sibling uses `"blocks[*]"` → verify the actual response shape, not a guess
- using declarative `response` when write-back needs to touch a wrapper field (`response.data.meta = ...`) → use `filterResponse` instead

## Runtime internals (for debugging)

`src/core/schema.ts` exposes:

- `compilePointerPath(path)` → `PathOp[]`
- `runPointerGet(root, ops, path, policy?)` → `unknown[]`
- `evaluatePointerPath(root, path, policy?)` → same, compiles inline
- `runPointerFilterTerminal(root, path, filter, policy?)` → terminal array replacement with in-place write-back
- `pointerPathRoot(path)` → top-level property name, or `undefined` for root `[*]`
- `isTerminalFilterCompatiblePointerPath(path)` → whether a `response.itemsAt` path is write-back safe; used by registry startup validation

`runPointerFilterTerminal` enforces two extra invariants:

- terminal segment must be an array expansion
- at most one array expansion in the whole path (multi-expand filter semantics are ambiguous; rejected fail-loud)

These invariants are also enforced at **startup** for `guard.response.itemsAt` by `registry.ts::validateSchema()` via `isTerminalFilterCompatiblePointerPath`. An incompatible `itemsAt` fails the registry import, not the first actual call. `filterResponse` (the imperative form) is not subject to this check.

## One-line summary

**Payload: `payloadTargets`. Response: `response` (declarative) or `filterResponse` (imperative). Both share PointerPath syntax. fail-loud on shape mismatch.**

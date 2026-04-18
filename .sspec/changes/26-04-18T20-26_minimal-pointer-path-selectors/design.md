---
change: "minimal-pointer-path-selectors"
created: 2026-04-18T20:26:16
---

# Design: minimal-pointer-path-selectors

## 1. Contract Direction

### 1.1 New selector grammar

```text
PointerPath ::= Segment ( "." Segment )*
Segment     ::= Name ("[*]")?
              | "[*]"              // root-array expand, first segment only
Name        ::= [A-Za-z_][A-Za-z0-9_]*
```

Examples the grammar MUST support:

```text
id
fromPaths[*]
items[*].blockId
blocks[*]
[*]
[*].id
```

Explicit non-goals:

```text
- no predicate filter
- no recursive descent
- no slices
- no $ root token
- no quoted keys
- no union selectors
```

### 1.2 Contract rewrite

```ts
interface PayloadTargetSpec {
  path: PointerPath;
  kind: ResourceKind;
  access: "read" | "write";
}

interface GuardSpec {
  payloadTargets?: PayloadTargetSpec[];
  response?: {
    itemsAt: PointerPath;
    fieldMap: Partial<Record<GuardFieldKind, string>>;
  };
  filterResponse?: (response: unknown, engine: PermissionEngineLike) => unknown;
}
```

Deleted from the contract:

```ts
PayloadTargetSpec.field
PayloadTargetSpec.isArray
```

## 2. Runtime Behavior

### 2.1 Shared evaluator

```ts
function evaluatePointerPath(root: unknown, path: PointerPath): unknown[]
```

Behavior:

- missing property → `[]`
- expected array but got non-array → throw shape error
- root `[*]` against non-array root → throw shape error
- scalar leaf → return single-element array

### 2.2 Guard execution flow

```text
payload guard
  -> evaluatePointerPath(payload, target.path)
  -> each extracted value MUST be string
  -> engine.checkContentRef(...)

response guard
  -> evaluatePointerPath(response, itemsAt)
  -> engine.filterItems(...)
  -> write kept values back when declarative response is used
  -> emit one CONTENT_FILTERED warning path
```

### 2.3 Migration consequences

```text
single payload field        field:"id"                -> path:"id"
array payload field         field:"ids"+isArray:true  -> path:"ids[*]"
root-array response         filterResponse             -> itemsAt:"[*]"
nested array response       itemsAt:"blocks[*]"       -> unchanged syntax, shared engine
```

## 3. Expected Migrations

### 3.1 Payload targets

| Old | New |
|---|---|
| `{ field: "id" }` | `{ path: "id" }` |
| `{ field: "fromPaths", isArray: true }` | `{ path: "fromPaths[*]" }` |
| `{ field: "refIDs", isArray: true }` | `{ path: "refIDs[*]" }` |

### 3.2 Response guards

| Endpoint | Current | Target |
|---|---|---|
| `query.sql` | imperative `filterResponse` | `itemsAt: "[*]"` |
| `block.getChildBlocks` | imperative `filterResponse` | `itemsAt: "[*]"` |
| `filetree.searchDocs` | imperative `filterResponse` | `itemsAt: "[*]"` |
| `search.fullTextSearchBlock` | `itemsAt: "blocks[*]"` | unchanged, new evaluator |
| `notebook.lsNotebooks` | `itemsAt: "notebooks[*]"` | unchanged, new evaluator |
| `filetree.listDocsByPath` | imperative `filterResponse` | keep imperative for now |

## 4. Boundary Decisions

### 4.1 Keep escape hatch

`filterResponse` stays. This change improves the declarative surface, but does not force every response shape into declarative form.

### 4.2 Keep resource kinds unchanged

This change does not add `hpath` or `local-path`. Selector unification and resource-semantics expansion are separate concerns.

### 4.3 Breaking migration by design

This is an alpha-stage contract cleanup. The implementation SHOULD migrate all in-repo schemas in one pass rather than keeping dual support.

## 5. Verification Shape

```text
- selector grammar unit tests
- payload guard tests for scalar, array, nested-array, and shape error cases
- response guard tests for root arrays and nested arrays
- migration regression across existing P1/P2/P3 endpoint suites
```

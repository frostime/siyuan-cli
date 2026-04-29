---
name: EndpointSchema
description: Authored contract for siyuan-cli endpoint definitions, including identity derivation, permission guard coupling, CLI behavior, and output semantics
updated: 2026-04-29
scope:
  - /src/shared/schema.ts
  - /src/api/registry.ts
  - /src/api/guard.ts
  - /src/shared/argv.ts
  - /src/shared/output.ts
  - /src/api/endpoints/**
  - /src/extension/cache.ts
deprecated: false
replacement: ""
---

# EndpointSchema

## Overview

`EndpointSchema` is the authored contract for `siyuan api` endpoints. It is not a bag of optional fields. Several fields are coupled and drive runtime behavior across five stages:

1. registry identity derivation,
2. risk and tag derivation,
3. CLI argument parsing,
4. permission guard execution,
5. compact output rendering and cache serialization.

This spec defines the stable rules that built-in endpoints and API extensions must both satisfy.

## Architecture

```mermaid
graph TD
    A[EndpointSchema authoring] --> B[EndpointRegistry.register]
    B --> C[id/group/name derivation]
    B --> D[classification -> risk/tags]
    B --> E[registry validation]
    E --> F[api/command parsePayload]
    E --> G[guard executeEndpoint]
    E --> H[output format selection]
    E --> I[extension cache serialization]
```

## Components

| Component | File | Responsibility |
|---|---|---|
| Type contract | `/src/shared/schema.ts` | Defines `EndpointSchema`, `EndpointClassification`, `FilterSpec`, `CliBehavior`, pointer-path helpers |
| Registry | `/src/api/registry.ts` | Derives endpoint identity and meta; enforces registry-level schema rules |
| CLI payload parser | `/src/shared/argv.ts` | Maps argv/json/file/positional input into `payload` using schema CLI metadata |
| Runtime guard | `/src/api/guard.ts` | Applies endpoint-level permission checks, payload guards, approval, response filtering |
| Output renderer | `/src/shared/output.ts` | Executes `format`/`formatStrategy` compact rendering |
| Extension cache | `/src/extension/cache.ts` | Serializes only cache-safe schema metadata |

## Specification

### 1. Identity is derived from `endpoint`

`endpoint` is the only authoritative identity field.

```ts
endpoint: "/api/query/sql"
```

The registry derives:

```ts
id = "query.sql"
group = "query"
name = "sql"
```

Rules:
- `endpoint` MUST match `/api/<group>/<name>`.
- Authors MUST NOT invent a second identity field for endpoints.
- Built-in and extension endpoints share the same identity derivation logic.

### 2. `classification` is authored truth

`classification` is the semantic source of truth for endpoint behavior.

```ts
classification: {
  mode: 'read' | 'write' | 'invoke',
  surface: 'meta' | 'content' | 'asset' | 'workspace' | 'runtime' | 'network',
  scope: 'single' | 'batch' | 'global',
  operation?: 'inspect' | 'search' | 'query' | 'create' | 'update' | 'delete' | 'move' | 'upload' | 'control',
  riskOverride?: 'safe' | 'sensitive' | 'elevated' | 'destructive' | 'critical'
}
```

Derived semantics:
- Registry tags are derived from `classification`.
- Risk is derived from `classification` unless `riskOverride` is set.
- Approval behavior uses the derived risk at runtime.

Risk matrix:

| classification | derived risk |
|---|---|
| `read + meta` | `safe` |
| `read + content/asset` | `sensitive` |
| `read + workspace/network` | `elevated` |
| `write + content/asset + single` | `elevated` |
| `write + content/asset + batch` | `destructive` |
| `write + workspace` | `critical` |
| `invoke + runtime` | `destructive` |
| `invoke + network` | `critical` |

### 3. Global read endpoints require a response guard

If an endpoint is:

```ts
classification: { mode: 'read', scope: 'global', ... }
```

then it MUST declare one of:
- `guard.response`
- `guard.filterResponse`

Reason:
- global reads can return data from multiple notebooks or paths,
- runtime filtering needs a declared extraction/filter contract,
- registry registration fails without it.

Valid example:

```ts
guard: {
  response: {
    itemsAt: '[*]',
    fieldMap: { id: 'id', path: 'path', notebook: 'box' }
  }
}
```

Invalid example:

```ts
classification: { mode: 'read', surface: 'content', scope: 'global' }
// no guard.response or guard.filterResponse
```

### 4. `guard.payloadTargets` must anchor into `payload.properties`

`payloadTargets` describe which payload fields represent protected resources.

```ts
guard: {
  payloadTargets: [
    { path: 'id', kind: 'id', access: 'read' },
    { path: 'paths[*]', kind: 'path', access: 'read' }
  ]
}
```

Rules:
- `path` MUST start from a declared payload property.
- The root segment of each `path` MUST exist in `payload.properties`.
- `kind` controls how runtime resolves the resource: `id`, `notebook`, `path`, `workspace-path`.
- `access` controls whether permission checks are evaluated as `read` or `write`.

Runtime effect:
- `executeEndpoint()` resolves each declared target and runs resource-level permission checks before the kernel call.

### 5. `guard.response.itemsAt` must fit terminal array filtering

Declarative response filtering supports only pointer paths compatible with terminal-array rewriting.

Allowed shapes:
- `[*]`
- `blocks[*]`
- `notebooks[*]`

Disallowed shape pattern:
- multiple array expansions in one path,
- paths that cannot be rewritten by terminal filtering.

Reason:
- runtime filtering extracts an array, filters items, then writes the filtered array back into the response shape.

When the response shape is more complex than this model, authors MUST use `guard.filterResponse` instead.

### 6. CLI metadata must match payload semantics

`cli` is not cosmetic. It controls how argv maps into `payload`.

#### 6.1 `cli.primary`

`cli.primary` names the payload field filled by the positional argument.

```ts
cli: { primary: 'stmt' }
```

This couples:
- help text,
- positional parsing,
- user-facing command shape.

Constraint:
- `cli.primary` SHOULD refer to a real payload field.
- In practice it is intended for a single string-like field.

#### 6.2 `cli.allowSource`

`allowSource` controls whether a field accepts:
- `literal`
- `file`
- `stdin`
- `env`

If omitted, the default is `['literal']`.

Constraint:
- each `allowSource` key SHOULD match a real payload field.

#### 6.3 `cli.skipFields`

Some payload field names collide with global CLI flags such as `file`, `json`, `workspace`, or `print`.

When a payload field must keep a reserved name, add it to `skipFields` so users pass it through `--json` instead of a generated per-field flag.

Example:

```ts
cli: { skipFields: ['file'] }
```

### 7. Multipart switches transport semantics

When `multipart` is present:

```ts
multipart: { fileFields: ['file[]'] }
```

request execution switches from JSON POST to multipart upload.

Effects:
- listed `fileFields` are treated as upload file paths,
- other string fields become form fields,
- API command collision logic treats multipart endpoints specially.

This is a transport-mode switch, not a display hint.

### 8. Output precedence is fixed

Compact rendering follows this order:

```text
format > formatStrategy > JSON fallback
```

Rules:
- If `format` exists, it always wins.
- `formatStrategy` is used only when `format` is absent.
- Without either, compact output falls back to JSON serialization.

### 9. Cache serialization is intentionally lossy

Extension schema cache files store only serializable metadata.

Cache-safe fields include:
- `endpoint`
- `summary`
- `description`
- `payload`
- `classification`
- declarative `guard` data
- `cli`
- `formatStrategy`
- `multipart`

Non-cacheable behavior stays in source modules:
- `format`
- `guard.filterResponse`

Consequence:
- discovery/help/list can operate from cache,
- execution must load source code to recover function behavior.

### 10. Registry parity requirement

Built-in endpoints and API extensions MUST satisfy the same registry-level `EndpointSchema` rules.

Difference in handling:
- built-in invalid schema: registration throws and startup fails loudly,
- extension invalid schema: registration warns and skips the extension.

This preserves safety while keeping extension discovery resilient.

## Examples

### A. Valid global content read with declarative response guard

```ts
export const schema: EndpointSchema = {
  endpoint: '/api/search/fullTextSearchBlock',
  summary: 'Full-text search blocks',
  payload: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      paths: { type: 'array', items: { type: 'string' } }
    }
  },
  classification: {
    mode: 'read',
    surface: 'content',
    scope: 'global',
    operation: 'search'
  },
  cli: { primary: 'query' },
  guard: {
    payloadTargets: [{ path: 'paths[*]', kind: 'path', access: 'read' }],
    response: {
      itemsAt: 'blocks[*]',
      fieldMap: { id: 'id', path: 'path', notebook: 'box' }
    }
  }
}
```

### B. Valid workspace write with reserved flag collision

```ts
export const schema: EndpointSchema = {
  endpoint: '/api/file/putFile',
  summary: 'Put file under workspace directory',
  payload: {
    type: 'object',
    required: ['path', 'file'],
    properties: {
      path: { type: 'string' },
      file: { type: 'string' }
    }
  },
  classification: {
    mode: 'write',
    surface: 'workspace',
    scope: 'single',
    operation: 'update'
  },
  cli: { skipFields: ['file'] },
  guard: {
    payloadTargets: [{ path: 'path', kind: 'workspace-path', access: 'write' }]
  },
  formatStrategy: 'transaction'
}
```

### C. Invalid global read without response guard

```ts
export const schema: EndpointSchema = {
  endpoint: '/api/custom/leaky',
  summary: 'Leaky endpoint',
  payload: { type: 'object', properties: {} },
  classification: {
    mode: 'read',
    surface: 'content',
    scope: 'global'
  }
}
```

Registry result:
- built-in registration throws,
- extension registration warns and skips.

## Testing Requirements

When changing `EndpointSchema` semantics, update or verify tests for:
- registry validation failures,
- permission guard behavior,
- response filtering on global reads,
- CLI parsing for `primary` and `allowSource`,
- output precedence between `format` and `formatStrategy`,
- extension cache serialization boundaries.

## References

- `/src/shared/schema.ts`
- `/src/api/registry.ts`
- `/src/api/guard.ts`
- `/src/shared/argv.ts`
- `/src/shared/output.ts`
- `/src/extension/cache.ts`
- `/src/docs/extension.md`

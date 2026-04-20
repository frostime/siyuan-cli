---
title: EndpointSchema Reference
slug: endpoint-schema
summary: Field-by-field reference for writing EndpointSchema in src/apis/**.
---

# EndpointSchema Reference

GATE: use this when authoring or editing a file under `src/apis/<group>/<n>.ts`.

## Minimal shape

```ts
import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/<group>/<name>",
  summary: "One-line description",
  payload: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", description: "Block ID", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    },
  },
  classification: {
    mode: "read",
    surface: "content",
    scope: "single",
    operation: "inspect",
  },
  guard: {
    payloadTargets: [
      { path: "id", kind: "id", access: "read" },
    ],
  },
};
```

## Every field

### `endpoint` (required)

The kernel path. Must match `^/api/[a-zA-Z0-9_]+/[a-zA-Z0-9_]+$`. The CLI id is derived as `<group>.<name>`.

### `summary` (required)

One sentence, present tense, starts with a verb. Shown in `siyuan api list` and `--help`.

### `description` (optional)

Multi-line prose. Shown in `--help` only. Reserve for non-obvious behavior.

### `payload` (required)

JSONSchema subset — not full JSONSchema, only:

- `type`: `"string" | "integer" | "number" | "boolean" | "array" | "object" | "null"`
- `description` — shown in CLI help
- `enum` — CLI help shows allowed values
- `default` — applied by argv parser before validation
- `pattern` — string regex (must be `additionalProperties: false` safe)
- `items` — nested schema for arrays
- `properties` / `required` / `additionalProperties` — object shape

Root must be `type: "object"` with `properties`. Keep `additionalProperties: false` unless the kernel genuinely accepts open-ended input (rare — `conf` objects are the main exception).

ID-shaped fields use pattern `^\\d{14}-[0-9a-z]{7}$`.

### `classification` (required)

See `11-classification-and-risk.md`. Four fields:

- `mode`: `"read" | "write" | "invoke"`
- `surface`: `"meta" | "content" | "asset" | "workspace" | "runtime" | "network"`
- `scope`: `"single" | "batch" | "global"`
- `operation`: `"inspect" | "search" | "query" | "create" | "update" | "delete" | "move" | "upload" | "control"` (optional)
- `riskOverride`: bypass automatic risk derivation (use sparingly; comment why)

### `guard` (optional but usually required)

See `12-guard-and-pointer-path.md`. Three shapes:

- `payloadTargets` — payload paths checked against permission engine before call
- `response` — declarative filter of kernel response
- `filterResponse` — imperative fallback

**Required if** `mode="read" + scope="global"`. Registry rejects missing guard at startup.

### `cli` (optional)

```ts
cli: {
  primary: "stmt",                                    // positional → this field
  aliases: { stmt: "s" },                             // short flags
  allowSource: { stmt: ["literal", "file", "stdin"] }, // @file/@stdin/@env whitelist
  examples: [
    { command: 'siyuan api query.sql "SELECT..."', description: "..." },
  ],
}
```

Fields not in `allowSource` default to `["literal"]` — they only accept inline strings, not `@file:` / `@stdin`. Large-text fields (`markdown`, `data`, `stmt`, `template`, `msg`, `content`) should enable `["literal", "file", "stdin"]`.

### `multipart` (optional)

For multipart/form-data endpoints like `/api/asset/upload`.

```ts
multipart: { fileFields: ["file[]"] }
```

Fields listed are sent as file uploads; other string fields are sent as form fields.

### `minKernelVersion` / `deprecated` (optional metadata)

Informational. No runtime effect yet.

## Conventions

- One endpoint per file. Filename = API name (camelCase), e.g. `getBlockKramdown.ts`.
- Always `export const schema: EndpointSchema = { ... }`.
- Add to `src/apis/index.ts` in the group's section, then to the `schemas` array.
- Write English `description` text; user-facing `summary` can stay concise.
- Paths in `description` stay in English (markdown / paths only).

## Validation at startup

`registry.register(schema)` calls `validateSchema()`:

1. endpoint id matches `/api/<group>/<n>`
2. `classification` is present
3. global-read endpoints have `guard.response` or `guard.filterResponse`
4. every `payloadTargets[*].path`'s root segment is a declared payload property
5. `guard.response.itemsAt` is terminal-filter compatible (at most one array expansion, which must be the terminal segment)

A bad schema throws at `import "./apis/index.js"`, so bugs surface before any command runs.

## Common smells

- declaring `additionalProperties: true` without reason → remove
- declaring pattern on non-string type → will not run
- missing `required` when the kernel actually requires the field → downstream error is cryptic, ajv catch is better
- payload target `path` that expands `[*]` on a non-array property → runtime throws `PointerPathShapeError`
- guarded field uses `"id"` kind but the value is actually an hpath → guard tries to resolve it as a block id and fails with `BLOCK_NOT_FOUND`; pick the correct `ResourceKind`

## `ResourceKind` selection

| Kind | When |
|---|---|
| `"id"` | 14-digit timestamp + 7-char suffix; resolved to `{notebook, path}` by permission engine |
| `"notebook"` | notebook id on its own |
| `"path"` | SiYuan id-based path like `/<doc-id>.sy` or `/<parent>/<child>.sy` |
| `"workspace-path"` | filesystem path under the workspace, used by `/api/file/*` and `/api/export/*` |

hpath (`/日记/2025-01-01`) has no ResourceKind — guard it separately or leave a comment (see `getIDsByHPath.ts`).

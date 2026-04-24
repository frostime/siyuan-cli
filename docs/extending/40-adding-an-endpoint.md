---
title: Adding a Kernel Endpoint
slug: adding-an-endpoint
summary: Step-by-step walkthrough for exposing a public SiYuan kernel API as a siyuan-cli endpoint.
---

# Adding a Kernel Endpoint

GATE: you have a documented kernel API (`/api/<group>/<n>`) with known payload and response shape. For undocumented or private APIs, read `41-adding-a-private-endpoint.md` first.

## Checklist

```text
[ ] 1. Create src/apis/<group>/<n>.ts
[ ] 2. Fill payload JSONSchema
[ ] 3. Pick classification (mode/surface/scope/operation)
[ ] 4. Decide guard (payloadTargets / response / filterResponse / none)
[ ] 5. Consider cli (primary / allowSource / examples)
[ ] 6. Consider compact `format` for read-heavy output
[ ] 7. Register in src/apis/index.ts
[ ] 8. Verify: pnpm typecheck && pnpm build && siyuan api <id> --help
```

## Step-by-step example

Goal: wrap `/api/block/getRefIDs` that takes `{ id }` and returns `{ refIDs: string[], defIDs: string[] }`.

### 1. Create the schema file

```ts
// src/apis/block/getRefIDs.ts
import type { EndpointSchema } from "../../core/schema.js";

export const schema: EndpointSchema = {
  endpoint: "/api/block/getRefIDs",
  summary: "Get block references and definitions by block id",
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

### 2. Pick classification

| Axis | Value | Why |
|---|---|---|
| `mode` | `read` | only fetches data |
| `surface` | `content` | operates on blocks |
| `scope` | `single` | one id in, one object out |
| `operation` | `inspect` | not a search, not a query |

Risk will derive to `sensitive`. No confirmation needed.

### 3. Guard

Payload has an id → `payloadTargets: [{ path: "id", kind: "id", access: "read" }]`.

Response shape `{ refIDs: string[], defIDs: string[] }` — these are ids but the scope is `single` and the kernel has already gated access by returning data for a known id. Items here are lists of *related* ids, not permission-scoped content listings. Leave response unguarded **if** the caller will re-check these ids in a follow-up call.

If you want defense-in-depth, add a response guard:

```ts
guard: {
  payloadTargets: [
    { path: "id", kind: "id", access: "read" },
  ],
  // refIDs / defIDs are parallel arrays at the root — neither is a single root-array.
  // filterResponse is the right tool here because of the two parallel arrays.
  filterResponse: async (response, engine) => {
    const r = response as { refIDs?: string[]; defIDs?: string[] };
    const filterIds = async (ids?: string[]) => {
      if (!ids?.length) return ids;
      const { kept } = await engine.filterItems(ids, (id) => ({ id: typeof id === "string" ? id : undefined }));
      return kept as string[];
    };
    r.refIDs = await filterIds(r.refIDs);
    r.defIDs = await filterIds(r.defIDs);
    return response;
  },
},
```

Trade-off: N extra SQL lookups per call. For high-traffic endpoints, skip and rely on the follow-up read being guarded.

### 4. CLI

Payload has a single required string field; make it primary:

```ts
cli: {
  primary: "id",
},
```

No `allowSource` — `id` is a short literal. No `examples` needed; the primary usage is obvious.

### 5. Compact output

If the endpoint returns bulky read data, add `format` so the default `--print compact` output stays short:

```ts
format: ({ result }) => {
  if (!Array.isArray(result)) return JSON.stringify(result, null, 2);
  return `${result.length} rows\n` + result.slice(0, 10).map((row, i) => `${i + 1}. ${JSON.stringify(row)}`).join("\n");
},
```

Keep the formatter lossy only in presentation terms. `--print json` remains the full-fidelity path.

### 6. Register

```ts
// src/apis/index.ts
import { schema as blockGetRefIDs } from "./block/getRefIDs.js";

const schemas = [
  // ...
  // Block
  // ...
  blockGetRefIDs,
  // ...
];
```

### 7. Verify

```sh
pnpm typecheck          # catches schema shape errors
pnpm build              # catches import path issues
node dist/cli.mjs api list --group block | grep getRefIDs
node dist/cli.mjs api describe block.getRefIDs
node dist/cli.mjs api block.getRefIDs --help
node dist/cli.mjs api block.getRefIDs 20260417120000-xxxxxxx
node dist/cli.mjs api block.getRefIDs 20260417120000-xxxxxxx --print json
```

## Decision trees

### Should the endpoint have `cli.primary`?

```text
payload has exactly one required string field that is the obvious "thing"?
  └── yes → set primary
payload has multiple required fields?
  └── no → user-facing reads a flag list anyway, no primary
```

### Should large fields get `allowSource`?

```text
field holds > ~1KB of text or a file's content?
  └── yes → allowSource: ["literal", "file", "stdin"]
field is secret-ish?
  └── add "env"
else
  └── default ["literal"] is fine
```

### Should `response` or `filterResponse` be used?

```text
unwrapped response is a homogeneous array?
  └── response: { itemsAt: "[*]", fieldMap: {...} }

response is { ..., blocks: [...] } with one array to filter?
  └── response: { itemsAt: "blocks[*]", fieldMap: {...} }

response has multiple arrays, nested wrappers, or conditional shape?
  └── filterResponse: (r, engine) => { ... }

response is a scalar or a fixed-shape object with no lists?
  └── no response guard
```

## Common mistakes to avoid

- **copy-paste classification from a sibling**: `moveBlock` is `operation: move`, `updateBlock` is `operation: update` — not interchangeable
- **forgetting `pattern` on id fields**: lets garbage through to the kernel, producing cryptic errors
- **guarding the wrong kind**: `{ path: "hpath", kind: "path", ... }` — `path` kind expects a SiYuan id-based path, not an hpath
- **setting `additionalProperties: true` to hush an error**: find the missing property declaration instead
- **skipping registration**: file exists, `pnpm build` passes, but `siyuan api list` doesn't show it → add to `src/apis/index.ts`

## After adding

If the endpoint enables a new workflow (e.g. backlink analysis), consider also:

- writing a tool that composes it with others (`42-adding-a-tool.md`)
- adding an entry to the relevant `src/docs/siyuan-guide/` if the endpoint surfaces a new domain concept

## One-line summary

**File → schema → classify → guard → register → verify. Seven steps, each file is ~30 lines.**

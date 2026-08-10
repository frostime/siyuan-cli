---
name: contributing-endpoints
summary: Workflow for adding documented and private SiYuan Kernel endpoints.
updated: 2026-08-10
scope:
  - /src/api/endpoints/**
  - /src/api/registry.ts
  - /src/api/guard.ts
  - /src/shared/schema.ts
---

# Adding an Endpoint

Use this guide when exposing a SiYuan Kernel API as a `siyuan-cli api` endpoint.

- **Documented endpoint**: the request and response contract is already known.
- **Private endpoint**: the endpoint is used by the SiYuan UI, a plugin, or community code but is not in the public API documentation. Complete the [private-endpoint investigation](#private-endpoint-investigation) before authoring the schema.

The authoritative endpoint contract is [EndpointSchema](../endpoint-schema.md). This guide only records the development workflow.

## Workflow

1. **Collect evidence**
   - Confirm the Kernel route, payload, response envelope, and relevant resource IDs.
   - For private endpoints, record the SiYuan version or commit where the behavior was observed.
2. **Create the schema** at `src/api/endpoints/<group>/<name>.ts`.
   - Define the JSON Schema with `additionalProperties: false`.
   - Add ID patterns and enums when the Kernel contract supports them.
3. **Classify the endpoint** using the current authored model:

   ```ts
   classification: {
       action: 'read' | 'write' | 'invoke',
       domain: 'meta' | 'content' | 'config' | 'storage' | 'runtime' | 'network' | 'ui',
       cardinality?: 'single' | 'batch' | 'global'
   }
   ```

   Use [EndpointSchema §2](../endpoint-schema.md#2-classification-is-authored-endpoint-metadata) for field semantics and severity derivation. Do not copy a sibling classification without checking the endpoint's actual effect.
4. **Declare permission guards**.
   - Payload IDs, notebooks, and paths belong in `guard.payloadTargets`.
   - Global reads that return lists require `guard.response` or `guard.filterResponse`.
   - Use `filterResponse` when the response cannot be represented by a terminal array path.
5. **Add CLI behavior only where it improves the command**.
   - Use `cli.primary` for the obvious single positional field.
   - Use `cli.allowSource` for large text or file-like input.
   - Add `format` or `formatStrategy` only when compact output needs a deliberate presentation.
6. **Register the schema** in `src/api/endpoints/index.ts`.
7. **Verify locally**:

   ```sh
   pnpm typecheck
   pnpm build
   pnpm run siyuan api list
   pnpm run siyuan api <id> --help
   pnpm run siyuan api <id> <minimal-input>
   pnpm run siyuan api <id> <minimal-input> --print json
   ```

## Private-endpoint investigation

Private endpoints require evidence because their contract can change without notice.

### Observe the route

Use one or more of:

- Browser DevTools: capture the request URL, body, response, and repeated variants.
- SiYuan source: find the route registration, handler, request struct, and response construction.
- Community plugins: compare real call sites and compatibility assumptions.

Do not infer field names from intuition. Keep the observed Kernel version and source/plugin anchor in the schema description.

### Translate the payload

Use the upstream Go struct and JSON tags as the source of field names:

| Go shape | JSON Schema consequence |
|---|---|
| non-pointer scalar | usually required, with the matching primitive type |
| pointer or `omitempty` field | optional |
| `[]T` | array with item schema |
| enum validation | add `enum` |
| SiYuan block ID | add the standard ID pattern |

Use `additionalProperties: true` only when the upstream contract is genuinely open-ended.

### Stabilize the response enough to guard it

The response declaration is optional, but permission-relevant response data must be understood:

- flat array → `guard.response.itemsAt: '[*]'`
- one nested array → `itemsAt: 'blocks[*]'` or equivalent
- multiple arrays or conditional shape → `guard.filterResponse`
- single object without a list → usually `payloadTargets` is sufficient

If a private endpoint is global and returns content from multiple resources, do not skip the response guard merely because the endpoint is undocumented.

### Record compatibility risk

For a private endpoint:

- set `minKernelVersion` when the first known compatible version matters;
- describe where the shape came from and which variants are known;
- add tests for the schema, guard, and version gate;
- prefer a clear failure over a permissive schema that silently accepts a changed contract.

## Common mistakes

- authoring the legacy `mode/surface/scope/operation` classification instead of the current model;
- forgetting to register the schema;
- using an hpath where a permission guard expects an ID-based path;
- declaring a global read without a response guard;
- setting `additionalProperties: true` to avoid completing the payload schema;
- probing a private endpoint without recording the Kernel version or evidence source.

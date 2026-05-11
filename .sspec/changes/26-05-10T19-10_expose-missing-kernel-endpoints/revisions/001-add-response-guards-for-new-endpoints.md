---
revision: 1
date: 2026-05-10T22:53:18
trigger: "review-feedback"
---

# Add response guards for new endpoints

## Reason

Review feedback identified that the newly added endpoints define payload-side guards but do not yet declare response-side filtering or concrete response data types. This leaves collection/map responses dependent on payload guards only and weakens the intended permission guard behavior for returned data.

## Changes

### Spec Impact

The endpoint change now additionally requires response declarations for the 14 new endpoint schemas. Endpoints whose responses can contain content resource collections or resource-bearing objects must filter returned data through the existing permission engine.

### Design Impact

Use existing guard mechanisms with one compatible extension:

- Declarative `guard.response` for array responses such as `block.getDocsInfo` and `block.getTailChildBlocks`.
- Imperative `guard.filterResponse` for response shapes not expressible by terminal array filtering:
  - ID-keyed maps: delete denied entries.
  - single resource objects: return `null` when denied.
  - sibling ID bundles: blank denied ID fields.
- `filterResponse` receives the caller context so custom filters evaluate rules the same way declarative response guards do.
- Write endpoints with `null` or transaction responses get response type declarations; their primary permission boundary remains payload guard.
- `attr.batchGetBlockAttrs` and `block.getBlockKramdowns` get endpoint-specific compact formatters because their ID-keyed map responses are not well represented by the generic `object` strategy. Kramdown compact output includes a system hint describing the splitter format and avoids Markdown fences so returned Kramdown content cannot collide with formatter delimiters.

### Task Impact

Add review feedback tasks to `tasks.md`: update filterResponse typing/caller propagation, add response data types, add response guards for relevant new endpoints, add custom compact formatters for ID-keyed map responses, and verify with tests/typecheck/build.

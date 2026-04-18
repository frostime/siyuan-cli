---
name: minimal-pointer-path-selectors
status: DONE
change-type: single
created: 2026-04-18T20:26:16
reference:
  - source: ".sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model"
    type: "prev-change"
    note: "Follow-up: unify payload/response selector contracts after the permission-model rollout"
  - source: ".sspec/changes/26-04-18T03-11_p3-rollout"
    type: "prev-change"
    note: "Consumes the review findings around jsonpath debt, root-array filtering, and selector asymmetry"
  - source: ".sspec/changes/26-04-18T20-26_minimal-pointer-path-selectors/revisions/001-pathprogram-runtime-redesign.md"
    type: "revision"
    note: "Upgrade the temporary selector helpers to a PathProgram-style runtime"
  - source: ".sspec/changes/26-04-18T20-26_minimal-pointer-path-selectors/revisions/002-terminal-filter-boundary.md"
    type: "revision"
    note: "Fail loud on unsupported multi-expand terminal filtering and record boundary semantics"
  - source: ".sspec/changes/26-04-18T20-26_minimal-pointer-path-selectors/revisions/003-dry-run-and-response-validation.md"
    type: "revision"
    note: "Route dry-run through the shared execution path and validate response write-back shapes at startup"
---

# minimal-pointer-path-selectors

## Problem Statement
Current selector support is split across two incompatible mechanisms:

- `PayloadTargetSpec` uses `field: string` plus `isArray?: boolean`, which only models top-level payload fields.
- `GuardSpec.response.itemsAt` uses a minimal path string like `blocks[*]`, but cannot express root arrays such as `[*]` or nested item extraction like `[*].id`.

This asymmetry has already produced visible debt in the finished permission rollout:

- root-array responses (`query.sql`, `getChildBlocks`, `searchDocs`) still need imperative `filterResponse`
- `isArray` exists as a shape patch instead of a real selector
- future nested payload references would require another contract amendment

The actual problem is selector-contract fragmentation, not path syntax weakness by itself.

## Proposed Solution

### Approach
Introduce one shared selector concept — **minimal pointer syntax** — and make both payload and response guards consume it.

The new syntax stays intentionally narrow: support only property segments plus `[*]` array expansion, including root arrays. This is enough to cover all known current debts without opening the door to full JSONPath complexity.

The migration is intentionally breaking at the contract level: `PayloadTargetSpec.field` / `isArray` collapse into a single `path` field. That keeps the post-change surface smaller and avoids a long dual-mode transition.

### Key Change
**Contract A: Unify selector encoding**  
Replace `PayloadTargetSpec.field` + `isArray` with `PayloadTargetSpec.path`, and define `GuardSpec.response.itemsAt` against the same selector grammar.

**Infra B: Add one shared evaluator**  
Implement a single pointer-path evaluator used by both payload guard execution and declarative response filtering.

**Cleanup C: Absorb root-array response debt**  
Migrate current root-array holdouts from imperative `filterResponse` to declarative response guards where the response shape is simple enough.

**Boundary D: Keep the syntax minimal**  
Explicitly exclude predicates, recursion, slices, `$`, quoted keys, and new `ResourceKind` additions such as `hpath` or `local-path`.

### Scope Summary
| File | Change |
|---|---|
| `src/core/schema.ts` | Redefine selector-facing contracts around `path` and minimal pointer syntax |
| `src/core/guard.ts` | Replace the current minimal jsonpath helpers with a shared selector evaluator |
| `src/apis/**` | Mechanically migrate `payloadTargets` and eligible declarative `response.itemsAt` usages |
| `tests/*.test.ts` | Replace `field/isArray` expectations, add selector grammar and root-array regression coverage |
| `README.md` / docs | Update contract examples from `field/isArray` to `path` |

### Design Reference
→ 详细技术设计见 [design.md](./design.md)

---
change: "expose-missing-kernel-endpoints"
created: 2026-05-10T19:10:17
---

# Design: expose-missing-kernel-endpoints

<!-- MUST maintain quality bar (non-negotiable):
Use semi-structured, formalized expression over flat prose.
Goal: maximize information density, minimize ambiguity, optimize reader comprehension.
In short: show, don't describe.

Fence nesting: when showing content that contains ```, outer fence MUST use more backticks. Always outer > inner.

Recommended tools (non-exhaustive):
- typed code block: interfaces, types, schemas, config, prompts...
- ASCII diagram: call chains, state machines, module trees, content outlines...
- table: before/after comparison, option tradeoffs, scope mapping...
- labeled items: multi-change annotation (Fix A / Feat B / Step 1...)
- pseudocode, decision trees, constraint lists

Anti-pattern:
  ❌ "We will add a function that accepts X and returns Y"
  ✅ `def process(x: Input) -> Output: ...`

  ❌ "The request first goes through module A, then is passed to B"
  ✅ request → A.validate() → B.process() → response
-->

<!-- SHOULD organize by the nature of the change. No fixed sections required.
Reference patterns by change type (pick what fits, not mandatory):

Feature/Bugfix  → interface signatures + behavioral flow + data model
Refactor        → before/after structural comparison + migration steps
Docs/Templates  → content outline + section hierarchy
Prompt/Rules    → before/after examples + decision logic
Config/Schema   → schema definition + migration path + compatibility strategy
-->

## 1. Endpoint Inventory

This table fixes the endpoint inventory and implementation baseline after external research. Detailed payload/response contracts live in `reference/missing-kernel-api-contracts.md`; conflict-prone endpoints still need local smoke tests before final review.

| Endpoint id | Kernel path | Classification baseline | Guard baseline | Output direction |
|-------------|-------------|--------------------------|--------------------------------------|------------------|
| `attr.batchGetBlockAttrs` | `/api/attr/batchGetBlockAttrs` | `read/content/batch/inspect` | `ids[*]` read | object |
| `attr.batchSetBlockAttrs` | `/api/attr/batchSetBlockAttrs` | `write/content/batch/update` | `blockAttrs[*].id` write | direct/OK |
| `block.getBlockKramdowns` | `/api/block/getBlockKramdowns` | `read/content/batch/inspect` | `ids[*]` read | object |
| `block.batchInsertBlock` | `/api/block/batchInsertBlock` | `write/content/batch/create` | `blocks[*].parentID/previousID/nextID` write, skipping empty anchors | transaction |
| `block.batchAppendBlock` | `/api/block/batchAppendBlock` | `write/content/batch/create` | `blocks[*].parentID` write | transaction |
| `block.batchPrependBlock` | `/api/block/batchPrependBlock` | `write/content/batch/create` | `blocks[*].parentID` write | transaction |
| `block.getDocInfo` | `/api/block/getDocInfo` | `read/content/single/inspect` | `id` read | object |
| `block.getDocsInfo` | `/api/block/getDocsInfo` | `read/content/batch/inspect` | `ids[*]` read | records |
| `block.getTailChildBlocks` | `/api/block/getTailChildBlocks` | `read/content/single/inspect` | `id` read | records |
| `block.getBlockSiblingID` | `/api/block/getBlockSiblingID` | `read/meta/single/inspect` | `id` read | object |
| `block.appendDailyNoteBlock` | `/api/block/appendDailyNoteBlock` | `write/content/single/create` | `notebook` write | transaction |
| `block.prependDailyNoteBlock` | `/api/block/prependDailyNoteBlock` | `write/content/single/create` | `notebook` write | transaction |
| `filetree.duplicateDoc` | `/api/filetree/duplicateDoc` | `write/content/single/create` | source `id` write conservatively | object |
| `filetree.getFullHPathByID` | `/api/filetree/getFullHPathByID` | `read/content/single/inspect` | `id` read | direct |

## 2. Structural Pattern

```text
src/api/endpoints/<group>/<name>.ts
  export const schema: EndpointSchema = {
    endpoint: "/api/<group>/<name>",
    summary,
    payload,
    classification,
    cli?,
    guard?,
    formatStrategy? | format?
  }

src/api/endpoints/index.ts
  import { schema as groupName } from './<group>/<name>.js';
  schemas = [..., groupName]
```

No registry or guard architecture changes are needed.

## 3. Verification Gate During Implementation

Implementation uses `reference/missing-kernel-api-contracts.md` as the baseline. Before final review, locally verify the endpoints where the report identifies docs/source disagreement or tricky guard semantics.

```text
Verify before final review:
  1. `block.getDocsInfo` raw response shape and default booleans.
  2. `filetree.duplicateDoc` response shape if safe dev fixture exists.
  3. `block.batchInsertBlock` empty-anchor behavior and guard skipping.
  4. `block.getBlockKramdowns` response map and optional mode.
```

### Guard examples

```ts
guard: {
  payloadTargets: [
    { path: 'ids[*]', kind: 'id', access: 'read' },
    { path: 'blocks[*].parentID', kind: 'id', access: 'write' },
    { path: 'blockAttrs[*].id', kind: 'id', access: 'write' }
  ]
}
```

### Empty optional anchors

If a kernel payload accepts empty strings for optional anchor IDs, schema patterns should allow empty strings and guard behavior must not reject absence-equivalent anchors. Existing `moveBlock.previousID` currently guards an optional-empty field; implementation should either preserve existing behavior consistency or avoid guarding truly optional empty anchors if pointer evaluation would create false denials.

## 4. Documentation Source Priority

Before writing each schema, verify payload and response signatures in this order:

1. existing local endpoint patterns in `src/api/endpoints/`;
2. kernel API docs at `https://leolee9086.github.io/siyuan-kernelApi-docs/index.html`;
3. upstream SiYuan source (`router.go` / handler implementation) if docs are missing or ambiguous.

If docs and source disagree, source wins and the mismatch is recorded in change memory.

## 5. Explicit Non-change

| Area | Decision |
|------|----------|
| Existing `block.getBlockKramdown` | Keep unchanged; add plural `block.getBlockKramdowns`. |
| Raw fallback | Implemented in sibling change `raw-api-fallback`, not here. |
| Tool wrappers | No new tool wrappers unless endpoint registration exposes a required usability gap during review. |
| Permission model | No changes; new endpoints use existing `classification` + `guard.payloadTargets`. |

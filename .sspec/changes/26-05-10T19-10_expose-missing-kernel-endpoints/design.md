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

This table fixes the endpoint inventory and initial classification direction. `Guard hypothesis` is deliberately provisional until docs/source confirm each payload shape.

| Endpoint id | Kernel path | Classification direction | Guard hypothesis (research required) | Output direction |
|-------------|-------------|--------------------------|--------------------------------------|------------------|
| `attr.batchGetBlockAttrs` | `/api/attr/batchGetBlockAttrs` | `read/content/batch/inspect` | `ids[*]` read | JSON/object |
| `attr.batchSetBlockAttrs` | `/api/attr/batchSetBlockAttrs` | `write/content/batch/update` | per-item `id` write | transaction/OK |
| `block.getBlockKramdowns` | `/api/block/getBlockKramdowns` | `read/content/batch/inspect` | `ids[*]` read | JSON/object |
| `block.batchInsertBlock` | `/api/block/batchInsertBlock` | `write/content/batch/create` | per-item anchor IDs write | transaction |
| `block.batchAppendBlock` | `/api/block/batchAppendBlock` | `write/content/batch/create` | per-item `parentID` write | transaction |
| `block.batchPrependBlock` | `/api/block/batchPrependBlock` | `write/content/batch/create` | per-item `parentID` write | transaction |
| `block.getDocInfo` | `/api/block/getDocInfo` | `read/content/single/inspect` | document/block id read | object |
| `block.getDocsInfo` | `/api/block/getDocsInfo` | `read/content/batch/inspect` | document/block ids read | records/JSON |
| `block.getTailChildBlocks` | `/api/block/getTailChildBlocks` | `read/content/batch/inspect` | parent/doc id read | records |
| `block.getBlockSiblingID` | `/api/block/getBlockSiblingID` | `read/content/single/inspect` | block id read | object |
| `block.appendDailyNoteBlock` | `/api/block/appendDailyNoteBlock` | `write/content/single/create` | notebook write | transaction |
| `block.prependDailyNoteBlock` | `/api/block/prependDailyNoteBlock` | `write/content/single/create` | notebook write | transaction |
| `filetree.duplicateDoc` | `/api/filetree/duplicateDoc` | `write/content/single/create` | source path/notebook write-capable | transaction/OK |
| `filetree.getFullHPathByID` | `/api/filetree/getFullHPathByID` | `read/content/single/inspect` | id read | direct |

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

## 3. Research Gate Before Implementation

Implementation MUST first verify each endpoint's payload and response shape. Guard paths are only authored after verification.

```text
For each endpoint:
  1. Locate kernel docs/source signature.
  2. Record payload fields + required/optional fields.
  3. Decide classification from actual effect.
  4. Add guard.payloadTargets only for verified id/notebook/path fields.
  5. If no resource field exists, document why guard is absent.
```

### Guard examples, not commitments

The following are examples of the kind of pointer paths expected if the payload shape matches; they are not final until research confirms the field names.

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

# Missing SiYuan Kernel API Contracts

## Summary

Research date: 2026-05-10. Primary docs source was the community kernel API documentation at <https://leolee9086.github.io/siyuan-kernelApi-docs/index.html>. That site states the general API convention that endpoints are POST unless noted and use the token in the `Authorization` header; individual pages also warn that they are community-maintained and source should be consulted when uncertain. Upstream source checked: `siyuan-note/siyuan` on GitHub, especially `kernel/api/router.go`, `kernel/api/attr.go`, `kernel/api/block.go`, `kernel/api/block_op.go`, and `kernel/api/filetree.go`.

| Endpoint | Status | Confidence | Key risk |
|---|---|---:|---|
| `attr.batchGetBlockAttrs` | Documented and source-confirmed | High | Response is an ID-keyed object, not an array. |
| `attr.batchSetBlockAttrs` | Documented and source-confirmed | High | Attribute values must be strings or `null`; `null` means remove/clear. |
| `block.getBlockKramdowns` | Source-confirmed; not listed in community block index | High | Optional `mode` exists; invalid IDs are skipped instead of failing the whole call. |
| `block.batchInsertBlock` | Source-confirmed; docs missing | High | Optional anchor IDs allow empty string; transactional atomicity is not explicitly guaranteed. |
| `block.batchAppendBlock` | Source-confirmed; docs missing | High | `blocks[*].parentID` is required and validated; any validation error prevents execution. |
| `block.batchPrependBlock` | Source-confirmed; docs missing | High | Same shape as batch append, but action is `prependInsert`. |
| `block.getDocInfo` | Documented but source returns opaque model object | Medium | Docs list a smaller shape; exact source model field set was not verified in handler source. |
| `block.getDocsInfo` | Documented but source disagrees | Medium | Source requires `refCount` and `av` booleans and returns an array/slice, while docs omit booleans and claim a map. |
| `block.getTailChildBlocks` | Documented and source-confirmed | High | `n` defaults to 7 when omitted or `< 1`. |
| `block.getBlockSiblingID` | Documented and source-confirmed | High | Response IDs can be empty strings when no sibling/parent exists. |
| `block.appendDailyNoteBlock` | Documented and source-confirmed | High | Creates today's daily note if absent, then appends block content. |
| `block.prependDailyNoteBlock` | Documented and source-confirmed | High | Creates today's daily note if absent, then prepends block content. |
| `filetree.duplicateDoc` | Documented but source disagrees | High | Source response is `{ id, notebook, path, hPath }`; docs claim extra fields. |
| `filetree.getFullHPathByID` | Documented and source-confirmed | High | Source is lenient on nil `id`; schema should still require it. |

## Endpoint Contracts

### attr.batchGetBlockAttrs

- Kernel path: `/api/attr/batchGetBlockAttrs`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/attr/batchGetBlockAttrs.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/attr.go:batchGetBlockAttrs`.
- Request JSON:

```json
{
  "ids": ["20200812220555-lj3enxa", "20200812220555-abc1234"]
}
```

  - Required: `ids`.
  - `ids`: array of block/document IDs as strings.
  - Empty string for IDs: not documented as allowed; source coerces `ids` entries to strings and passes them to `sql.BatchGetBlockAttrs`, but the local schema should reject empty/non-pattern IDs for guardability.
- Response data:

```json
{
  "20200812220555-lj3enxa": {
    "id": "20200812220555-lj3enxa",
    "updated": "20240101000000",
    "custom-key": "value"
  },
  "20200812220555-abc1234": {
    "id": "20200812220555-abc1234"
  }
}
```

  - Actual top-level `data` shape is an object/map keyed by requested block ID; each value is an attribute map of string keys to string values. The docs show the same ID-keyed object shape. Source sets `ret.Data = sql.BatchGetBlockAttrs(idList)`.
- Semantics: read-only batch inspection of block Inline Attribute List (IAL) data; no content mutation.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'read', surface: 'content', scope: 'batch', operation: 'inspect' }
guard: { payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }] }
formatStrategy: 'object'
```

- Notes / traps:
  - Do not model `data` as an array. It is an ID-keyed object.
  - Source does not visibly validate each ID in the handler; the CLI schema should validate with the existing SiYuan ID regex.

### attr.batchSetBlockAttrs

- Kernel path: `/api/attr/batchSetBlockAttrs`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/attr/batchSetBlockAttrs.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/attr.go:batchSetBlockAttrs`; single-item behavior in `kernel/api/attr.go:setBlockAttrs`.
- Request JSON:

```json
{
  "blockAttrs": [
    {
      "id": "20200812220555-lj3enxa",
      "attrs": {
        "custom-status": "done",
        "custom-old-key": null
      }
    }
  ]
}
```

  - Required: `blockAttrs`.
  - `blockAttrs`: array of objects.
  - `blockAttrs[*].id`: block/document ID string; source validates it with `util.InvalidIDPattern`.
  - `blockAttrs[*].attrs`: object/map. Each value must be a string or `null`; source rejects non-string, non-null values with code `-1` and a type error message.
  - `null` attribute values are converted to empty string before calling the model layer; docs describe this as removing the attribute.
  - Empty string for `id`: not allowed; source ID validation rejects invalid IDs.
- Response data:

```json
null
```

  - `data` is not set by the handler after `model.BatchSetBlockAttrs(...)`; standard response therefore has `data: null`.
- Semantics: write batch update of block attributes. Source validates all IDs and attribute value types before calling `model.BatchSetBlockAttrs`; no transaction array is returned. Whether the underlying model update is all-or-nothing is not documented in the handler.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'write', surface: 'content', scope: 'batch', operation: 'update' }
guard: { payloadTargets: [{ path: 'blockAttrs[*].id', kind: 'id', access: 'write' }] }
formatStrategy: 'direct'
```

- Notes / traps:
  - Existing `setBlockAttrs` uses `formatStrategy: 'transaction'` in the project context even though source returns `null`. For the batch endpoint, `direct` is less misleading unless the formatter treats `null` write success specially.
  - JSON Schema cannot fully type arbitrary `attrs` values as `string | null` with the current lightweight schema subset if `additionalProperties` only accepts boolean. Consider a runtime validator or allow object and document the stricter source behavior.

### block.getBlockKramdowns

- Kernel path: `/api/block/getBlockKramdowns`
- Sources: upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block.go:getBlockKramdowns`. The community block index at <https://leolee9086.github.io/siyuan-kernelApi-docs/block/index.html> lists `getBlockKramdown` but not `getBlockKramdowns`; a direct docs page for `getBlockKramdowns` was not available during research.
- Request JSON:

```json
{
  "ids": ["20200812220555-lj3enxa", "20200812220555-abc1234"],
  "mode": "md"
}
```

  - Required: `ids`.
  - Optional: `mode`.
  - `ids`: array of block/document ID strings.
  - `mode`: string enum `"md" | "textmark"`; source defaults to `"md"` when omitted and returns code `-1` for other values.
  - Empty string for IDs: not allowed by the recommended schema. Source behavior is unusual: it skips invalid IDs instead of failing the whole request.
- Response data:

```json
{
  "20200812220555-lj3enxa": "# Heading\n\nContent",
  "20200812220555-abc1234": "Paragraph content"
}
```

  - Actual top-level `data` shape is an object/map keyed by ID, with Kramdown text string values.
  - Source initializes an empty map, skips invalid IDs, and in readonly-filtered cases may set a requested ID value to an empty string.
- Semantics: read-only batch inspection/export of blocks as Kramdown/textmark. No content mutation.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'read', surface: 'content', scope: 'batch', operation: 'inspect' }
guard: { payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }] }
formatStrategy: 'object'
```

- Notes / traps:
  - Do not confuse with singular `/api/block/getBlockKramdown`, whose `data` is `{ id, kramdown }`.
  - Source accepts `mode` for the batch endpoint, even if some older wrappers omit it.
  - Invalid IDs are silently skipped by source; local validation should preferably fail early for predictable CLI behavior.

### block.batchInsertBlock

- Kernel path: `/api/block/batchInsertBlock`
- Sources: upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block_op.go:batchInsertBlock`. The community block index at <https://leolee9086.github.io/siyuan-kernelApi-docs/block/index.html> does not list this endpoint.
- Request JSON:

```json
{
  "blocks": [
    {
      "data": "Inserted markdown",
      "dataType": "markdown",
      "previousID": "20200812220555-lj3enxa"
    },
    {
      "data": "<div data-type=\"NodeParagraph\">Inserted DOM</div>",
      "dataType": "dom",
      "parentID": "20200812220555-abc1234",
      "nextID": ""
    }
  ]
}
```

  - Required: `blocks`.
  - `blocks`: array of insert objects.
  - Each block object requires `data` and `dataType`.
  - `data`: string block content.
  - `dataType`: string enum `"markdown" | "dom"`.
  - Optional anchors: `parentID`, `previousID`, `nextID`.
  - Empty string for anchor IDs: allowed by source. For each optional anchor, source checks `nil != value && "" != value` before validating ID pattern, so an explicit empty string is treated like no anchor.
- Response data:

```json
[
  {
    "timestamp": 1710000000000,
    "doOperations": [
      {
        "action": "insert",
        "id": "20240310120000-abcdefg",
        "data": "<div data-type=\"NodeParagraph\">Inserted markdown</div>",
        "parentID": "",
        "previousID": "20200812220555-lj3enxa",
        "nextID": ""
      }
    ],
    "undoOperations": null
  }
]
```

  - Actual top-level `data` shape is an array of transaction objects returned from `model.PerformTransactions(&transactions)`.
  - Key transaction fields observed in existing project schemas and source operation construction: `timestamp`, `doOperations`, `undoOperations`; operation action is `"insert"` and includes generated `id`, `data`, and anchor IDs.
- Semantics: write batch creation/insert of blocks. Markdown input is converted to block DOM before transaction construction; DOM input is used directly. Source prevalidates anchors for every block before performing transactions, then performs the whole slice through a single `model.PerformTransactions(&transactions)` call, flushes, returns the transactions, and broadcasts them.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'write', surface: 'content', scope: 'batch', operation: 'create' }
guard: {
  payloadTargets: [
    { path: 'blocks[*].parentID', kind: 'id', access: 'write' },
    { path: 'blocks[*].previousID', kind: 'id', access: 'write' },
    { path: 'blocks[*].nextID', kind: 'id', access: 'write' }
  ]
}
formatStrategy: 'transaction'
```

- Notes / traps:
  - The local JSON schema should allow `""` for `parentID`/`previousID`/`nextID`, unlike normal ID fields. A pattern-only schema would reject a source-supported payload.
  - At least one anchor is logically needed for a meaningful insert, but the handler itself does not clearly enforce “exactly one” or “at least one”; do not invent that rule in the contract unless tested.
  - Atomicity is not proven. Source batches operations into one `PerformTransactions` call, but no explicit rollback guarantee was found in the handler.

### block.batchAppendBlock

- Kernel path: `/api/block/batchAppendBlock`
- Sources: upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block_op.go:batchAppendBlock`. The community block index at <https://leolee9086.github.io/siyuan-kernelApi-docs/block/index.html> does not list this endpoint.
- Request JSON:

```json
{
  "blocks": [
    {
      "data": "Appended markdown",
      "dataType": "markdown",
      "parentID": "20200812220555-lj3enxa"
    }
  ]
}
```

  - Required: `blocks`.
  - `blocks`: array of append objects.
  - Each object requires `data`, `dataType`, and `parentID`.
  - `dataType`: string enum `"markdown" | "dom"`.
  - `parentID`: block/document ID string; source validates ID pattern.
  - Empty string for `parentID`: not allowed; source validates required `parentID`.
- Response data:

```json
[
  {
    "timestamp": 1710000000000,
    "doOperations": [
      {
        "action": "appendInsert",
        "id": "20240310120000-abcdefg",
        "data": "<div data-type=\"NodeParagraph\">Appended markdown</div>",
        "parentID": "20200812220555-lj3enxa"
      }
    ],
    "undoOperations": null
  }
]
```

  - Actual top-level `data` shape is an array of transaction objects.
  - Operation action is `"appendInsert"`.
- Semantics: write batch creation of child blocks appended to parent blocks/documents. Source prevalidates every parent ID, converts Markdown to DOM as needed, executes transactions through one `PerformTransactions` call, flushes, returns transactions, and broadcasts them.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'write', surface: 'content', scope: 'batch', operation: 'create' }
guard: { payloadTargets: [{ path: 'blocks[*].parentID', kind: 'id', access: 'write' }] }
formatStrategy: 'transaction'
```

- Notes / traps:
  - Shape is `{ blocks: [...] }`, not a top-level array.
  - Source does not expose an all-or-nothing guarantee beyond prevalidation before the single transaction call.

### block.batchPrependBlock

- Kernel path: `/api/block/batchPrependBlock`
- Sources: upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block_op.go:batchPrependBlock`. The community block index at <https://leolee9086.github.io/siyuan-kernelApi-docs/block/index.html> does not list this endpoint.
- Request JSON:

```json
{
  "blocks": [
    {
      "data": "Prepended markdown",
      "dataType": "markdown",
      "parentID": "20200812220555-lj3enxa"
    }
  ]
}
```

  - Required: `blocks`.
  - `blocks`: array of prepend objects.
  - Each object requires `data`, `dataType`, and `parentID`.
  - `dataType`: string enum `"markdown" | "dom"`.
  - `parentID`: block/document ID string; source validates ID pattern.
  - Empty string for `parentID`: not allowed.
- Response data:

```json
[
  {
    "timestamp": 1710000000000,
    "doOperations": [
      {
        "action": "prependInsert",
        "id": "20240310120000-abcdefg",
        "data": "<div data-type=\"NodeParagraph\">Prepended markdown</div>",
        "parentID": "20200812220555-lj3enxa"
      }
    ],
    "undoOperations": null
  }
]
```

  - Actual top-level `data` shape is an array of transaction objects.
  - Operation action is `"prependInsert"`.
- Semantics: write batch creation of child blocks prepended to parent blocks/documents. Source prevalidates every parent ID, converts Markdown to DOM as needed, executes through one `PerformTransactions` call, flushes, returns transactions, and broadcasts them.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'write', surface: 'content', scope: 'batch', operation: 'create' }
guard: { payloadTargets: [{ path: 'blocks[*].parentID', kind: 'id', access: 'write' }] }
formatStrategy: 'transaction'
```

- Notes / traps:
  - Same payload shape as batch append; only transaction action/placement differs.

### block.getDocInfo

- Kernel path: `/api/block/getDocInfo`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/block/getDocInfo.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block.go:getDocInfo`.
- Request JSON:

```json
{
  "id": "20200812220555-lj3enxa"
}
```

  - Required: `id`.
  - `id`: document or block ID string; source calls `model.GetDocInfo(id)` for the document containing that ID.
  - Empty string for `id`: not documented as allowed; recommended schema should reject it.
- Response data:

```json
{
  "id": "20200812220555-lj3enxa",
  "box": "20200812220555-abcdefg",
  "name": "Document title",
  "path": "/20200812220555-lj3enxa.sy"
}
```

  - Docs claim `data` contains at least `id`, `box`, `name`, and `path`.
  - Source does **not** construct that object in the handler; it returns the model object from `model.GetDocInfo(id)` directly and returns code `-1` if it is nil. Therefore the exact field set should be treated as the model-layer `BlockInfo`/doc-info object, not the smaller docs example.
- Semantics: read-only inspection of the document info for the document containing a block/document ID. In readonly-filtered cases source may null the info if the path is not readable.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'read', surface: 'content', scope: 'single', operation: 'inspect' }
guard: { payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }] }
formatStrategy: 'object'
```

- Notes / traps:
  - Do not hard-code only the four documented fields unless implementation intentionally narrows output. Source returns a model object.
  - Confidence is medium because the handler was verified, but the model struct fields were not fully resolved from source in this pass.

### block.getDocsInfo

- Kernel path: `/api/block/getDocsInfo`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/block/getDocsInfo.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block.go:getDocsInfo`.
- Request JSON:

```json
{
  "ids": ["20200812220555-lj3enxa", "20200812220555-abc1234"],
  "refCount": false,
  "av": false
}
```

  - Required by source: `ids`, `refCount`, `av`.
  - `ids`: array of document/block ID strings.
  - `refCount`: boolean; source reads it with a direct boolean assertion and passes it to `model.GetDocsInfo`.
  - `av`: boolean; source reads it with a direct boolean assertion and passes it to `model.GetDocsInfo`.
  - Empty string for IDs: not documented as allowed; recommended schema should reject it.
- Response data:

```json
[
  {
    "id": "20200812220555-lj3enxa",
    "box": "20200812220555-abcdefg",
    "name": "Document title",
    "path": "/20200812220555-lj3enxa.sy"
  }
]
```

  - Source returns the value from `model.GetDocsInfo(ids, queryRefCount, queryAv)` directly and then iterates it by index (`for i, docinfo := range info`), so the verified top-level shape is an array/slice of doc-info objects.
  - Docs claim the request only needs `ids` and that `data` is a map keyed by doc ID. That conflicts with source; source should win.
- Semantics: read-only batch inspection of document info. Optional model-level enrichment is controlled by `refCount` and `av` booleans. In readonly-filtered cases source can set unreadable array entries to `nil`.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'read', surface: 'content', scope: 'batch', operation: 'inspect' }
guard: { payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }] }
formatStrategy: 'records'
```

- Notes / traps:
  - This is the strongest docs/source disagreement found.
  - Include `refCount` and `av` in payload schema, probably defaulting both to `false` at the CLI layer to avoid caller surprises.
  - Model object field set remains medium confidence for the same reason as `getDocInfo`.

### block.getTailChildBlocks

- Kernel path: `/api/block/getTailChildBlocks`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/block/getTailChildBlocks.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block.go:getTailChildBlocks`.
- Request JSON:

```json
{
  "id": "20200812220555-lj3enxa",
  "n": 7
}
```

  - Required: `id`.
  - Optional: `n`.
  - `id`: parent block/document ID string; source validates ID pattern.
  - `n`: integer count of tail child blocks. Source defaults to 7 when omitted or when the supplied value is less than 1.
  - Empty string for `id`: not allowed; source validation rejects invalid IDs.
- Response data:

```json
[
  {
    "id": "20200812220555-child01",
    "type": "p",
    "content": "Tail child content"
  }
]
```

  - Actual top-level `data` shape is an array of child block info objects returned by `model.GetTailChildBlocks(id, n)`. Docs show an array and describe child-block fields.
- Semantics: read-only inspection of the last `n` child blocks under a parent/document.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'read', surface: 'content', scope: 'single', operation: 'inspect' }
guard: { payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }] }
formatStrategy: 'records'
```

- Notes / traps:
  - Schema can set `n` default 7, but source also treats `0`/negative as 7.

### block.getBlockSiblingID

- Kernel path: `/api/block/getBlockSiblingID`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/block/getBlockSiblingID.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block.go:getBlockSiblingID`.
- Request JSON:

```json
{
  "id": "20200812220555-lj3enxa"
}
```

  - Required: `id`.
  - `id`: block/document ID string.
  - Empty string for `id`: not documented as allowed; recommended schema should reject it.
- Response data:

```json
{
  "parent": "20200812220555-parent1",
  "previous": "20200812220555-prev001",
  "next": ""
}
```

  - Actual `data` shape is `{ parent: string, previous: string, next: string }`.
  - Empty string is a valid response value for missing parent/previous/next, as documented and reflected by source returning strings from `model.GetBlockSiblingID(id)`.
- Semantics: read-only metadata/structure inspection of a block's adjacent IDs. It does not read block content.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'read', surface: 'meta', scope: 'single', operation: 'inspect' }
guard: { payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }] }
formatStrategy: 'object'
```

- Notes / traps:
  - Keep response fields as `parent`, `previous`, `next`; do not rename to `parentID`/`previousID`/`nextID`.

### block.appendDailyNoteBlock

- Kernel path: `/api/block/appendDailyNoteBlock`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/block/appendDailyNoteBlock.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block_op.go:appendDailyNoteBlock`.
- Request JSON:

```json
{
  "notebook": "20200812220555-abcdefg",
  "data": "Daily note content",
  "dataType": "markdown"
}
```

  - Required: `notebook`, `data`, `dataType`.
  - `notebook`: notebook ID string; source validates it with the ID pattern.
  - `data`: string block content.
  - `dataType`: string enum `"markdown" | "dom"`.
  - Empty string for `notebook`: not allowed; source validation rejects invalid IDs.
- Response data:

```json
[
  {
    "timestamp": 1710000000000,
    "doOperations": [
      {
        "action": "appendInsert",
        "id": "20240310120000-abcdefg",
        "data": "<div data-type=\"NodeParagraph\">Daily note content</div>",
        "parentID": "20240310000000-dailyn1"
      }
    ],
    "undoOperations": null
  }
]
```

  - Actual top-level `data` shape is an array of transaction objects.
  - Source action is `"appendInsert"`; `parentID` is the daily note document ID returned/created by `model.CreateDailyNote(boxID)`.
- Semantics: write operation. Creates today's daily note in the target notebook if absent, then appends block content to that daily note. Markdown is converted to block DOM. Source performs one transaction, flushes, returns it, and broadcasts it.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'write', surface: 'content', scope: 'single', operation: 'create' }
guard: { payloadTargets: [{ path: 'notebook', kind: 'notebook', access: 'write' }] }
formatStrategy: 'transaction'
```

- Notes / traps:
  - The payload does not contain the eventual daily-note document ID, so notebook-level write guard is the only verified payload target.
  - Treat as write/create even if the daily note already exists, because it creates a new child block.

### block.prependDailyNoteBlock

- Kernel path: `/api/block/prependDailyNoteBlock`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/block/prependDailyNoteBlock.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/block_op.go:prependDailyNoteBlock`.
- Request JSON:

```json
{
  "notebook": "20200812220555-abcdefg",
  "data": "Daily note content",
  "dataType": "markdown"
}
```

  - Required: `notebook`, `data`, `dataType`.
  - `notebook`: notebook ID string; source validates it with the ID pattern.
  - `data`: string block content.
  - `dataType`: string enum `"markdown" | "dom"`.
  - Empty string for `notebook`: not allowed.
- Response data:

```json
[
  {
    "timestamp": 1710000000000,
    "doOperations": [
      {
        "action": "prependInsert",
        "id": "20240310120000-abcdefg",
        "data": "<div data-type=\"NodeParagraph\">Daily note content</div>",
        "parentID": "20240310000000-dailyn1"
      }
    ],
    "undoOperations": null
  }
]
```

  - Actual top-level `data` shape is an array of transaction objects.
  - Source action is `"prependInsert"`.
- Semantics: write operation. Creates today's daily note in the target notebook if absent, then prepends block content to that daily note. Markdown is converted to block DOM.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'write', surface: 'content', scope: 'single', operation: 'create' }
guard: { payloadTargets: [{ path: 'notebook', kind: 'notebook', access: 'write' }] }
formatStrategy: 'transaction'
```

- Notes / traps:
  - Same request shape as append; transaction action and placement differ.

### filetree.duplicateDoc

- Kernel path: `/api/filetree/duplicateDoc`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/filetree/duplicateDoc.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/filetree.go:duplicateDoc`.
- Request JSON:

```json
{
  "id": "20200812220555-lj3enxa"
}
```

  - Required: `id`.
  - `id`: source document ID string.
  - Empty string for `id`: not documented as allowed; recommended schema should reject it even though the handler primarily fails through tree lookup rather than explicit pattern validation.
- Response data:

```json
{
  "id": "20240310120000-abcdefg",
  "notebook": "20200812220555-abcdefg",
  "path": "/20240310120000-abcdefg.sy",
  "hPath": "/Copied document title"
}
```

  - Source response is exactly an object with keys `id`, `notebook`, `path`, and `hPath` after `model.DuplicateDoc(tree)` and `pushCreate(...)`.
  - Docs claim a larger object with `rootID`, `parentID`, `box`, `path`, `hPath`, and `name`. This conflicts with source; source should win.
- Semantics: write/create operation that duplicates a document and its child structure/content in the same file-tree context. It creates a new document, not a move.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'write', surface: 'content', scope: 'single', operation: 'create' }
guard: {
  payloadTargets: [
    { path: 'id', kind: 'id', access: 'read' },
    { path: 'id', kind: 'id', access: 'write' }
  ]
}
formatStrategy: 'object'
```

- Notes / traps:
  - The payload only identifies the source document, while the write target is inferred as the same notebook/directory. If duplicate guard entries are awkward, prefer conservative `{ path: 'id', kind: 'id', access: 'write' }` over read-only guarding.
  - Do not use docs-only fields (`rootID`, `parentID`, `box`, `name`) in typed response unless runtime tests show they are present in the target SiYuan version.

### filetree.getFullHPathByID

- Kernel path: `/api/filetree/getFullHPathByID`
- Sources: community docs page <https://leolee9086.github.io/siyuan-kernelApi-docs/filetree/getFullHPathByID.html>; upstream route in `kernel/api/router.go`; upstream handler `kernel/api/filetree.go:getFullHPathByID`.
- Request JSON:

```json
{
  "id": "20200812220555-lj3enxa"
}
```

  - Required by docs/recommended schema: `id`.
  - `id`: document/block ID string.
  - Empty string for `id`: not documented as allowed; recommended schema should reject it.
  - Source edge case: if the `id` field is absent/nil, handler returns the default response without setting an error before type assertion. Do not copy that leniency into the CLI schema.
- Response data:

```json
"/Notebook name/Parent document/Current document"
```

  - Actual top-level `data` shape is a string full human-readable path.
- Semantics: read-only inspection of full human-readable path for a document/block ID.
- Recommended EndpointSchema fields:

```ts
classification: { mode: 'read', surface: 'content', scope: 'single', operation: 'inspect' }
guard: { payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }] }
formatStrategy: 'direct'
```

- Notes / traps:
  - This differs from `/api/filetree/getHPathByID`, which returns the document hPath without the notebook prefix.

## Cross-cutting findings

1. **Community docs are useful but not authoritative.** The docs site itself is community-maintained. For endpoints with disagreement, this report follows upstream source.
2. **Batch block insert/append/prepend endpoints are in source but absent from the community block index.** Use `kernel/api/router.go` plus `kernel/api/block_op.go` as the primary contract.
3. **`dataType` enum is consistently `"markdown" | "dom"` for block insertion-style endpoints.** Markdown is converted to block DOM before transaction construction.
4. **Transaction responses are arrays.** The block creation endpoints covered here return `data` as a transaction array, not a single transaction object.
5. **Empty anchor IDs are special only for `batchInsertBlock`.** Source allows explicit `""` for `parentID`, `previousID`, and `nextID` by skipping validation when the string is empty. Other required IDs/notebook fields should use normal ID validation.
6. **`getDocsInfo` needs special handling.** Source requires `refCount` and `av` booleans and returns an array/slice. Default both booleans to `false` in the CLI wrapper if ergonomic defaults are desired.
7. **Guard pointer paths should use array wildcards for batch payloads.** Recommended paths: `ids[*]`, `blockAttrs[*].id`, and `blocks[*].parentID` / `blocks[*].previousID` / `blocks[*].nextID`.
8. **Atomicity should not be overstated.** Several handlers prevalidate then call `model.PerformTransactions(&transactions)`, but no handler-level rollback/all-or-nothing guarantee was found. Describe them as transaction-backed/batched, not proven atomic.

## Unresolved questions

1. Exact model-layer field set for the doc-info objects returned by `block.getDocInfo`, `block.getDocsInfo`, and `block.getTailChildBlocks` should be verified against the current `model` structs or live kernel responses before writing narrow TypeScript response interfaces.
2. Runtime behavior for malformed `getDocsInfo` payloads missing `refCount` or `av` should be tested. Source direct type assertions imply the fields are required, but middleware may recover from panics or normalize JSON args.
3. Runtime response fields for `filetree.duplicateDoc` should be smoke-tested against the minimum SiYuan version supported by `@frostime/siyuan-cli`, because community docs claim extra fields while current source returns only four.
4. The permission engine’s behavior with two guard entries on the same pointer (`duplicateDoc` read+write) should be checked. If it cannot represent this cleanly, use a conservative write guard on `id`.

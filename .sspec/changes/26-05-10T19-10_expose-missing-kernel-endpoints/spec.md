---
name: expose-missing-kernel-endpoints
status: PLANNING
change-type: single
created: 2026-05-10 19:10:17
reference:
- source: .sspec/requests/26-05-07T13-00_expose-missing-kernel-apis.md
  type: request
  note: Linked manually; covers the missing EndpointSchema half
---

<!-- MUST follow frontmatter schema:
status: PLANNING | DOING | REVIEW | DONE | BLOCKED
change-type: single | sub
reference?: Array<{source, type: 'request'|'root-change'|'sub-change'|'prev-change'|'doc'|'revision', note?}>

Sub-change MUST link root:
reference:
  - source: ".sspec/changes/<root-change-dir>"
    type: "root-change"
    note: "Phase <n>: <phase-name>"

Single-change common reference:
reference:
  - source: ".sspec/requests/<request-file>.md"
    type: "request"
  - source: ".sspec/changes/<change-dir>"
    type: "prev-change"
    note: "Follow-up to <change-name>."
-->

# expose-missing-kernel-endpoints

## Problem Statement

<!-- Quantify impact. Format: "[metric] causing [impact]".
Simple: single paragraph. Complex: split into "Current state" + "User need". -->

14 Agent-useful kernel APIs are missing from the built-in endpoint registry, causing batch attribute/block workflows, sibling lookup, document duplication, and document metadata reads to require repeated round trips, SQL workarounds, or direct kernel calls outside the normal guard pipeline.

## Proposed Solution

### Approach
<!-- Core solution (1-3 paragraphs) + why this approach over alternatives -->

Add `EndpointSchema` files for the requested missing APIs and register them in `src/api/endpoints/index.ts`. Each endpoint follows the existing convention: one schema file per endpoint, authored `classification`, `guard.payloadTargets` where the verified payload identifies protected resources, and compact output through existing format strategies unless the endpoint needs raw JSON preservation.

This change intentionally covers both the first-priority and second-priority endpoints from the request. `block.getBlockKramdown` already exists; this change adds only the plural batch endpoint `block.getBlockKramdowns`.

Endpoint inventory is fixed by this design. Payload schemas, response shapes, and guard pointer paths are explicitly **research-required** before implementation: current guard notes are hypotheses, not final contracts. Authoritative kernel docs/source decide the final schema.

### Key Change
<!-- MUST label each independent change item as **Type Label: Title**.
Examples: **Fix A: Request linking** / **Feat B: Cache TTL jitter**
tasks.md references these labels — MUST NOT copy the design description.
If scope boundary is unclear, add a "What Stays Unchanged" block after Scope Summary.
Fence nesting: when showing content containing ```, outer fence MUST use more backticks (outer > inner). -->

**Endpoint A: Batch attribute APIs**

Expose `attr.batchGetBlockAttrs` and `attr.batchSetBlockAttrs` with id-based payload guards.

**Endpoint B: Batch block creation APIs**

Expose `block.batchInsertBlock`, `block.batchAppendBlock`, and `block.batchPrependBlock` using batch write classification and transaction-style output.

**Endpoint C: Batch/content read helpers**

Expose `block.getBlockKramdowns`, `block.getDocInfo`, `block.getDocsInfo`, and `block.getTailChildBlocks` for efficient content/context reads.

**Endpoint D: Navigation and daily-note helpers**

Expose `block.getBlockSiblingID`, `block.appendDailyNoteBlock`, and `block.prependDailyNoteBlock`.

**Endpoint E: Filetree copy/path helpers**

Expose `filetree.duplicateDoc` and `filetree.getFullHPathByID`.

**Registry F: Built-in endpoint registration**

Import and register all new endpoint schemas in `src/api/endpoints/index.ts`.

### Scope Summary
<!-- MUST end every spec with a File | Change table. -->

| File | Change |
|------|--------|
| `src/api/endpoints/attr/batchGetBlockAttrs.ts` | New endpoint schema. |
| `src/api/endpoints/attr/batchSetBlockAttrs.ts` | New endpoint schema. |
| `src/api/endpoints/block/batchInsertBlock.ts` | New endpoint schema. |
| `src/api/endpoints/block/batchAppendBlock.ts` | New endpoint schema. |
| `src/api/endpoints/block/batchPrependBlock.ts` | New endpoint schema. |
| `src/api/endpoints/block/getBlockKramdowns.ts` | New endpoint schema; distinct from existing singular endpoint. |
| `src/api/endpoints/block/getDocInfo.ts` | New endpoint schema. |
| `src/api/endpoints/block/getDocsInfo.ts` | New endpoint schema. |
| `src/api/endpoints/block/getTailChildBlocks.ts` | New endpoint schema. |
| `src/api/endpoints/block/getBlockSiblingID.ts` | New endpoint schema. |
| `src/api/endpoints/block/appendDailyNoteBlock.ts` | New endpoint schema. |
| `src/api/endpoints/block/prependDailyNoteBlock.ts` | New endpoint schema. |
| `src/api/endpoints/filetree/duplicateDoc.ts` | New endpoint schema. |
| `src/api/endpoints/filetree/getFullHPathByID.ts` | New endpoint schema. |
| `src/api/endpoints/index.ts` | Register new schemas. |

### Design Reference
<!-- MUST create design.md when the change involves new interfaces, data model changes,
or architectural logic changes. Link here: → See [design.md](./design.md)
Simple changes MAY delete this section and describe the technical approach inline. -->

→ See [design.md](./design.md)

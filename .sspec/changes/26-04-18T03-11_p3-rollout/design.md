---
change: "p3-rollout"
created: 2026-04-18T03:11:51
---

# Design: p3-rollout

## 1. Rollout Strategy

### 1.1 Batch partition

```text
Batch A1  block.* + attr.*                  (~14 endpoints)
Batch A2  export.* + convert.* + template.* + search.* + asset.*   (~7 endpoints)
Batch B1  file.* + notebook.*               (~11 endpoints)
Batch B2  filetree.*                        (~14 endpoints)
Batch C   system.* + notification.* + network.* + sqlite.*         (~8 endpoints)
Batch Z   remove legacy bridge + docs/tests cleanup
```

This keeps each batch reviewable and allows commit-by-batch execution.

### 1.2 Required migration actions per endpoint

For every endpoint in rollout scope:

```text
1. add authored classification
2. add payloadTargets if payload contains resource references
3. keep/add response guard if mode=read && scope=global
4. add riskOverride only when matrix is materially wrong
5. remove tags
```

### 1.3 Response guard semantics

```text
SiyuanClient.call() / upload() unwrap the kernel envelope and return `body.data`.
Therefore `guard.response.itemsAt` is always evaluated relative to unwrapped `data`.
Examples:
- notebooks[*]
- blocks[*]
Root arrays should use filterResponse.
```

### 1.4 Contract gate for arrays

Current P1 contract supports only flat string `payloadTargets.field`.

Known array-shaped resource inputs in remaining endpoints:

```text
block/transferBlockRef.ts      -> refIDs[]
filetree/moveDocs.ts           -> fromPaths[]
filetree/moveDocsByID.ts       -> fromIDs[]
export/exportResources.ts      -> paths[]
search/fullTextSearchBlock.ts  -> paths[]
filetree/getIDsByHPath.ts      -> paths[]
asset/upload.ts                -> file[]
```

**Gate rule**

```text
If an endpoint needs resource-authorization over array items,
P3 must not invent ad-hoc schema extensions.
Return to P1 amendment first.
```

**Phase 6 path decision**

```text
Choose Path A:
1. add array item authorization support via P1 amendment
2. migrate holdout endpoints
3. remove deriveClassificationFromLegacyTags() only after holdouts are gone
```

This means P3 proceeds in two lanes:
- migrate contract-compatible endpoints directly
- pause contract-blocked endpoints behind amendment if needed

---

## 2. Batch Details

### 2.1 Batch A1 — block + attr

**Primary goals**
- remove legacy tags from remaining content read/write endpoints
- standardize multi-id / single-id payload targets
- reuse `moveBlock` / `getBlockKramdown` patterns from P2

**Typical mappings**

```ts
// block.updateBlock
classification: { mode: "write", surface: "content", scope: "single", operation: "update" }
guard: { payloadTargets: [{ field: "id", kind: "id", access: "write" }] }

// block.getBlockInfo
classification: { mode: "read", surface: "content", scope: "single", operation: "inspect" }
guard: { payloadTargets: [{ field: "id", kind: "id", access: "read" }] }

// attr.setBlockAttrs
classification: { mode: "write", surface: "content", scope: "single", operation: "update" }
guard: { payloadTargets: [{ field: "id", kind: "id", access: "write" }] }
```

**Watchpoints**
- `insertBlock` / `appendBlock` / `prependBlock`
- `transferBlockRef` (`refIDs[]` likely triggers contract gate)

### 2.2 Batch A2 — export / convert / template / search / asset

**Primary goals**
- classify utility endpoints without widening contract dimensions
- keep global read endpoints on response-filter path

**Typical mappings**

```ts
// search.fullTextSearchBlock
classification: { mode: "read", surface: "content", scope: "global", operation: "search" }
guard: { response or filterResponse required }

// export.exportMdContent
classification: { mode: "read", surface: "content", scope: "single", operation: "inspect" }
guard: { payloadTargets: [{ field: "id", kind: "id", access: "read" }] }

// asset.upload
classification: { mode: "write", surface: "asset", scope: "single", operation: "upload" }
```

**Watchpoints**
- `asset/upload.ts` has array payload but local file array may not require content/workspace authorization
- `search.fullTextSearchBlock.paths[]` is an array input and may require amendment if it must be authorized item-by-item

### 2.3 Batch B1 — file + notebook

**Primary goals**
- finish workspace model for all `file.*`
- normalize notebook open/close/create/remove/conf endpoints

**Typical mappings**

```ts
// file.readDir
classification: { mode: "read", surface: "workspace", scope: "single", operation: "inspect" }
guard: { payloadTargets: [{ field: "path", kind: "workspace-path", access: "read" }] }

// file.renameFile
classification: { mode: "write", surface: "workspace", scope: "single", operation: "move" }
guard: { payloadTargets: [
  { field: "path", kind: "workspace-path", access: "write" },
  { field: "newPath", kind: "workspace-path", access: "write" },
] }

// notebook.setNotebookConf
classification: { mode: "write", surface: "content", scope: "single", operation: "update" }
guard: { payloadTargets: [{ field: "notebook", kind: "notebook", access: "write" }] }
```

### 2.4 Batch B2 — filetree

**Primary goals**
- normalize path/id/notebook combinations in filetree APIs
- detect array-resource endpoints early

**Typical mappings**

```ts
// filetree.listDocsByPath
classification: { mode: "read", surface: "content", scope: "batch", operation: "inspect" }
guard: {
  payloadTargets: [
    { field: "notebook", kind: "notebook", access: "read" },
    { field: "path", kind: "path", access: "read" },
  ],
  filterResponse: ...
}

// filetree.removeDocByID
classification: { mode: "write", surface: "content", scope: "single", operation: "delete" }
guard: { payloadTargets: [{ field: "id", kind: "id", access: "write" }] }
```

**Watchpoints**
- `moveDocs.ts` / `moveDocsByID.ts` likely blocked by array contract gate
- `getIDsByHPath.ts` may also block on array semantics

### 2.5 Batch C — system / notification / network / sqlite

**Primary goals**
- finish runtime/meta/network split
- define remaining risk overrides deliberately

**Typical mappings**

```ts
// system.version
classification: { mode: "read", surface: "meta", scope: "single", operation: "inspect" }

// system.logoutAuth
classification: { mode: "invoke", surface: "runtime", scope: "single", operation: "control" }

// network.forwardProxy
classification: { mode: "invoke", surface: "network", scope: "single", operation: "control" }

// sqlite.flushTransaction
classification: { mode: "invoke", surface: "runtime", scope: "single", operation: "control" }
```

---

## 3. Legacy Bridge Removal

### 3.1 Removal condition

```text
All remaining endpoint schemas must author classification.
No runtime behavior may read legacy schema.tags.
No remaining endpoint should rely on deriveClassificationFromLegacyTags().
```

### 3.2 Final cleanup

```text
registry.ts
  - remove deriveClassificationFromLegacyTags()
  - remove transition-only fallback branches
schema.ts
  - remove legacy acceptance comments if rollout fully complete
apis/**
  - no tags remain
```

Bridge removal should happen in the last commit of P3, after all migrated batches pass validation.

---

## 4. Regression Strategy

### 4.1 Always-on checks per batch

```bash
pnpm typecheck
pnpm build
node dist/cli.mjs api list > NUL
tsx --test tests/p1-core-contracts.test.ts tests/p2-demo-adoption.test.ts
```

### 4.2 Batch-level expectations

```text
- no registry register errors
- no endpoint left in partially migrated state (classification + tags together is prohibited unless explicitly transitional)
- smoke command can load all schemas after each batch
```

### 4.3 Additional rollout checks

```text
- workspace endpoints still map to workspace-path
- remaining global read endpoints still define response guard/filter
- riskOverride list is explicit and reviewable
```

---

## 5. Non-goals

```text
- introducing new contract dimensions beyond P1
- inventing array payload authorization ad-hoc inside rollout
- rewriting SQL payloads
- redesigning tool capability model in this phase
```

If rollout hits these needs, stop and route back to P1 amendment or a separate follow-up change.

---
change: "endpoint-default-format"
created: 2026-04-27T18:43:16
---

# Tasks: endpoint-default-format

## Phase 1: Core Infrastructure

- [ ] **1.1** `src/shared/schema.ts` — Add `FormatStrategy` type + `formatStrategy?` field to `EndpointSchema` per design §1
- [ ] **1.2** `src/shared/output.ts` — Implement 5 strategy renderers + `applyFormatStrategy` dispatcher per design §2-3
- [ ] **1.3** `src/api/command.ts` — Wire `formatStrategy` into `preparePrintedOutput` call per design §4

**Verification:** `pnpm build` passes. Manually test `siyuan api system.version --print compact` still works (has custom format, should be unaffected).

## Phase 2: Assign `direct` Strategy (7 endpoints)

- [ ] **2.1** `filetree/getHPathByID.ts` — add `formatStrategy: 'direct'`
- [ ] **2.2** `filetree/getHPathByPath.ts` — add `formatStrategy: 'direct'`
- [ ] **2.3** `filetree/getPathByID.ts` — add `formatStrategy: 'direct'`
- [ ] **2.4** `filetree/createDocWithMd.ts` — add `formatStrategy: 'direct'`
- [ ] **2.5** `filetree/createDailyNote.ts` — add `formatStrategy: 'direct'`
- [ ] **2.6** `filetree/getIDsByHPath.ts` — add `formatStrategy: 'direct'`
- [ ] **2.7** `template/renderSprig.ts` — add `formatStrategy: 'direct'`

**Verification:** `pnpm build` passes. Test `siyuan api filetree.getHPathByID --id <id> --print compact` outputs plain string, not JSON.

## Phase 3: Assign `records` Strategy (4 endpoints)

- [ ] **3.1** `block/getChildBlocks.ts` — add `formatStrategy: 'records'`
- [ ] **3.2** `block/getBlockBreadcrumb.ts` — add `formatStrategy: 'records'`
- [ ] **3.3** `filetree/searchDocs.ts` — add `formatStrategy: 'records'`
- [ ] **3.4** `notebook/lsNotebooks.ts` — add `formatStrategy: 'records'`

**Verification:** `pnpm build` passes. Test `siyuan api notebook.lsNotebooks --print compact` outputs table format, not JSON.

## Phase 4: Assign `transaction` Strategy (29 endpoints)

- [ ] **4.1** `block/appendBlock.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.2** `block/prependBlock.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.3** `block/insertBlock.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.4** `block/updateBlock.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.5** `block/deleteBlock.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.6** `block/moveBlock.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.7** `block/foldBlock.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.8** `block/unfoldBlock.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.9** `block/transferBlockRef.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.10** `attr/setBlockAttrs.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.11** `filetree/renameDoc.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.12** `filetree/renameDocByID.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.13** `filetree/removeDoc.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.14** `filetree/removeDocByID.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.15** `filetree/moveDocs.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.16** `filetree/moveDocsByID.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.17** `notebook/renameNotebook.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.18** `notebook/removeNotebook.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.19** `notebook/openNotebook.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.20** `notebook/closeNotebook.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.21** `notebook/setNotebookConf.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.22** `file/putFile.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.23** `file/removeFile.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.24** `file/renameFile.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.25** `sqlite/flushTransaction.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.26** `notification/pushMsg.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.27** `notification/pushErrMsg.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.28** `system/exit.ts` — add `formatStrategy: 'transaction'`
- [ ] **4.29** `system/logoutAuth.ts` — add `formatStrategy: 'transaction'`

**Verification:** `pnpm build` passes. Test write endpoint outputs `OK | ids=... | ops=...`.

## Phase 5: Assign `object` Strategy (9 endpoints)

- [ ] **5.1** `block/getBlockInfo.ts` — add `formatStrategy: 'object'`
- [ ] **5.2** `block/getBlockDOM.ts` — add `formatStrategy: 'object'`
- [ ] **5.3** `attr/getBlockAttrs.ts` — add `formatStrategy: 'object'`
- [ ] **5.4** `export/exportMdContent.ts` — add `formatStrategy: 'object'`
- [ ] **5.5** `export/exportResources.ts` — add `formatStrategy: 'object'`
- [ ] **5.6** `convert/pandoc.ts` — add `formatStrategy: 'object'`
- [ ] **5.7** `template/render.ts` — add `formatStrategy: 'object'`
- [ ] **5.8** `network/forwardProxy.ts` — add `formatStrategy: 'object'`
- [ ] **5.9** `notebook/createNotebook.ts` — add `formatStrategy: 'object'`

**Verification:** `pnpm build` passes. Test `siyuan api block.getBlockInfo --id <id> --print compact` outputs `key=val | ...` format.

## Phase 6: Assign `json` Strategy (5 endpoints)

- [ ] **6.1** `system/getConf.ts` — add `formatStrategy: 'json'`
- [ ] **6.2** `system/bootProgress.ts` — add `formatStrategy: 'json'`
- [ ] **6.3** `notebook/getNotebookConf.ts` — add `formatStrategy: 'json'`
- [ ] **6.4** `file/getFile.ts` — add `formatStrategy: 'json'`
- [ ] **6.5** `asset/upload.ts` — add `formatStrategy: 'json'`

**Verification:** `pnpm build` passes. These output explicit JSON even in compact mode.

## Phase 7: Final Verification

- [ ] **7.1** `pnpm build` clean pass
- [ ] **7.2** Spot-check 5+ endpoints across strategies with `--print compact`
- [ ] **7.3** Verify `--print json` still outputs raw JSON for all endpoints
- [ ] **7.4** Verify endpoints with existing `format` functions are unaffected

---

## Progress

| Phase | Status | Tasks |
|-------|--------|-------|
| 1: Core | not started | 0/3 |
| 2: direct | not started | 0/7 |
| 3: records | not started | 0/4 |
| 4: transaction | not started | 0/29 |
| 5: object | not started | 0/9 |
| 6: json | not started | 0/5 |
| 7: Verify | not started | 0/4 |

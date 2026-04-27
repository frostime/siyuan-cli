---
change: "endpoint-default-format"
created: 2026-04-27T18:43:16
---

# Tasks: endpoint-default-format

## Phase 1: Core Infrastructure

- [x] **1.1** `src/shared/schema.ts` — Add `FormatStrategy` type + `formatStrategy?` field to `EndpointSchema`
- [x] **1.2** `src/shared/output.ts` — Implement 5 strategy renderers + `applyFormatStrategy` dispatcher
- [x] **1.3** `src/api/command.ts` — Wire `formatStrategy` into `preparePrintedOutput` call

## Phase 2: Assign `direct` Strategy (6 endpoints)

- [x] **2.1** `filetree/getHPathByID.ts`
- [x] **2.2** `filetree/getHPathByPath.ts`
- [x] **2.3** `filetree/getPathByID.ts`
- [x] **2.4** `filetree/createDocWithMd.ts`
- [x] **2.5** `filetree/createDailyNote.ts` — ~~`direct`~~ → `object` (returns `{id: string}`, not scalar)
- [x] **2.6** `filetree/getIDsByHPath.ts`
- [x] **2.7** `template/renderSprig.ts`

## Phase 3: Assign `records` Strategy (4 endpoints)

- [x] **3.1** `block/getChildBlocks.ts`
- [x] **3.2** `block/getBlockBreadcrumb.ts`
- [x] **3.3** `filetree/searchDocs.ts`
- [x] **3.4** `notebook/lsNotebooks.ts`

## Phase 4: Assign `transaction` Strategy (29 endpoints)

- [x] **4.1–4.9** block group (append, prepend, insert, update, delete, move, fold, unfold, transferBlockRef)
- [x] **4.10** `attr/setBlockAttrs.ts`
- [x] **4.11–4.16** filetree group (rename, remove, move — by path and by ID)
- [x] **4.17–4.21** notebook group (rename, remove, open, close, setNotebookConf)
- [x] **4.22–4.24** file group (put, remove, rename)
- [x] **4.25** `sqlite/flushTransaction.ts`
- [x] **4.26–4.27** notification group (pushMsg, pushErrMsg)
- [x] **4.28–4.29** system group (exit, logoutAuth)

## Phase 5: Assign `object` Strategy (10 endpoints)

- [x] **5.1** `block/getBlockInfo.ts`
- [x] **5.2** `block/getBlockDOM.ts`
- [x] **5.3** `attr/getBlockAttrs.ts`
- [x] **5.4** `export/exportMdContent.ts`
- [x] **5.5** `export/exportResources.ts`
- [x] **5.6** `convert/pandoc.ts`
- [x] **5.7** `template/render.ts`
- [x] **5.8** `network/forwardProxy.ts`
- [x] **5.9** `notebook/createNotebook.ts`
- [x] **5.10** `filetree/createDailyNote.ts` (moved from direct)

## Phase 6: Assign `json` Strategy (5 endpoints)

- [x] **6.1** `system/getConf.ts`
- [x] **6.2** `system/bootProgress.ts`
- [x] **6.3** `notebook/getNotebookConf.ts`
- [x] **6.4** `file/getFile.ts`
- [x] **6.5** `asset/upload.ts`

## Phase 7: Final Verification

- [x] **7.1** `pnpm build` clean pass ✓
- [x] **7.2** Spot-check endpoints with `--print compact` (kernel-backed checks completed)
- [x] **7.3** Verify `--print json` unaffected (kernel-backed checks completed)
- [x] **7.4** Verify existing `format` functions unaffected (kernel-backed checks completed)

---

## Progress

| Phase | Status | Tasks |
|-------|--------|-------|
| 1: Core | ✅ done | 3/3 |
| 2: direct | ✅ done | 7/7 |
| 3: records | ✅ done | 4/4 |
| 4: transaction | ✅ done | 29/29 |
| 5: object | ✅ done | 10/10 |
| 6: json | ✅ done | 5/5 |
| 7: Verify | ✅ done | 4/4 (build + kernel-backed runtime checks) |

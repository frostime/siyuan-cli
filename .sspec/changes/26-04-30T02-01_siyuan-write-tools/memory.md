# Memory: siyuan-write-tools

**Updated**: 2026-04-30T18:30+08:00

## Git Baseline (Immutable)

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `710505584a7323f199a3652d8fbe5a0f5e91e921`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
```

## State

Implementation complete. All 4 phases done. Ready for review.

## Key Files

- `src/api/endpoints/import/importStdMd.ts` — NEW: guarded importStdMd endpoint schema
- `src/api/endpoints/index.ts` — ADD: register importStdMd
- `src/tool/builtins/brute-edit.ts` — NEW: doc-level text search-replace tool
- `src/tool/builtins/push-md.ts` — NEW: local .md → SiYuan import tool
- `src/tool/builtins/index.ts` — register both tools
- `tests/endpoint-schemas.test.ts` — ADD: importStdMd schema coverage
- `tests/tool-write-tools.test.ts` — NEW: write-tool behavior tests
- `revisions/001-pre-implement-corrections.md` — 5 behavioral corrections + scope expansion

## Knowledge

### SiYuan Kernel API Internals

- [2026-04-30] [Gotcha] **`importStdMd` `toPath` must be internal `.sy` path, NOT HPath.** Empirically verified: passing HPath (e.g. `/inbox`) returns `code:0` but silently creates nothing — kernel's `GetBlockTreeRootByPath` returns nil, function returns nil without error. Must convert HPath → internal path via `getIDsByHPath` + `getPathByID` before calling. Root `"/"` is the only exception (works directly).
- [2026-04-30] [Gotcha] **`getChildBlocks` `markdown` field has NO kramdown IAL.** Verified on live kernel v3.6.5. The `markdown` field in `ChildBlock` from SQL `blocks.markdown` column is plain rendered markdown without `{: id=...}` annotations.
- [2026-04-30] [Gotcha] **`/api/block/transferBlockRef` is expensive for overwrite use case.** Without `refIDs`, it queries ALL refs to `fromID`, loads each referencing tree, rewrites block-ref IDs, writes back, and flushes SQL. Full-tree rewrite+reindex per referencing doc — unacceptable for a CLI tool. Rejected from push-md v1; potential v2 opt-in with explicit `--force-overwrite` flag.
- [2026-04-30] [Gotcha] **`/api/search/findReplace` is GLOBAL, not document-scoped.** When `ids` contains a document ID (`type='d'`), the kernel only replaces the document **title** and **tags** — child block content is **silently skipped**. Source: `kernel/model/search.go:575-611`. Correct usage: pass empty `ids` (global Replace All with path/box/type filters) or pass individual block IDs. The frontend uses this correctly: `ids: isAll ? [] : [currentBlockId]`.
- [2026-04-30] [Gotcha] **`findReplace` replaceTypes default is empty → no-op.** Must explicitly set types like `{"text": true, "docTitle": true}`. 22 types available (text, code, em, strong, aHref, imgSrc, blockRef, etc.). Method=2 (SQL) is explicitly rejected by kernel; method=1 (syntax) auto-downgraded to 0.
- [2026-04-30] [Gotcha] **`findReplace` groupBy must be 0.** Non-zero is rejected — grouping makes replacement impossible because search only returns document-level results.
- [2026-04-30] [Gotcha] **`/api/import/importStdMd` does NOT return created document ID.** After import, must query `filetree.getIDsByHPath` to locate the new document. Also: `importStdMd` never overwrites — always creates a new doc with a new ID.
- [2026-04-30] [Gotcha] **`importStdMd` localPath restriction:** cannot be a subpath of SiYuan working directory, and cannot be a "sensitive path". Kernel rejects both with specific error messages.
- [2026-04-30] [Gotcha] **SiYuan allows multiple documents with the same hpath.** So `getIDsByHHPath` can return multiple IDs. Must sort by `created DESC` and take the newest after import.
- [2026-04-30] [Gotcha] **`block.updateBlock` on a document (`type='d'`) replaces all child blocks.** The kernel reparses the markdown and updates the child block structure. Confirmed by sy-bind-mdfile which uses `updateBlock('markdown', content, doc.id)` for overwrite mode. Child block IDs are regenerated.
- [2026-04-30] [Gotcha] **`/api/block/getTreeStat`** returns `{runeCount, wordCount, linkCount, imageCount, refCount, blockCount}` — counts outbound refs (AST walk), NOT inbound refs. For inbound ref checks, SQL on `refs` table is still needed.

### Design Decisions & Rationale

- [2026-04-30] [Rejected] **Thin tool wrappers** (list-notebooks, search-doc, search-keyword, query-sql, create-doc) — all are thin API wrappers, CLI already has `siyuan api` for raw access. Not worth builtin tool overhead.
- [2026-04-30] [Rejected] **`search.findReplace` endpoint schema** — global search-replace, mismatch with document-level edit use case. Investigation preserved in reference for potential future evaluation.
- [2026-04-30] [Rejected] **push-md with `custom-siyuan-cli-push-source` attribute** — this is the sy-bind-mdfile pattern for stateful binding. CLI is stateless; user explicitly specifies `--overwrite` or not. Caller manages the mapping.
- [2026-04-30] [Rejected] **push-md manual image processing** (regex + file.putFile per image) — replaced by `importStdMd` which handles images, base64, HTML img, links, YFM automatically. Much simpler and more complete.
- [2026-04-30] [Decision] **brute-edit search uniqueness**: each `search` must match exactly once in the document. 0 or >1 → reject all. Uses `String.replace()` (not `replaceAll`) since uniqueness is pre-verified. All-or-nothing: any check failure → entire operation rejected, document unchanged.
  - [2026-04-30] **Superseded by §5**: brute-edit now uses **original-span application model**. Replacements are applied against original match byte ranges, sorted end-to-start. Later replacements cannot accidentally match text introduced by earlier ones. Overlapping original match ranges are rejected.
- [2026-04-30] [Decision] **brute-edit write-back**: single `block.updateBlock` call, not delete+append. Confirmed that `updateBlock` on a document reparses markdown and updates child blocks.
- [2026-04-30] [Decision] **push-md overwrite safety**: `--overwrite` checks inbound refs on the existing document. If any refs found → refuse (overwrite would change doc ID, breaking those refs). This mirrors brute-edit's ref safety check.
  - [2026-04-30] **Amended by §3**: ref safety check covers **document root + all descendant blocks**, not just root. Overwrite deletes the entire tree — all block IDs change, so any inbound ref to any child block would break.
- [2026-04-30] [Decision] **push-md no hpath duplication check**: SiYuan allows multiple docs with the same hpath. We don't prevent creating duplicates. `--overwrite` only triggers when user explicitly wants to replace.
  - [2026-04-30] **Superseded by §1**: Create mode now **refuses** if target hpath has existing documents. `--overwrite` requires exactly one existing doc; multiple docs at same hpath → ambiguous error.
- [2026-04-30] [Decision] **`callEndpointRaw` for importStdMd**: the endpoint is not registered in CLI schema (user decision: no endpoint additions). Tool bypasses registry via `callEndpointRaw('/api/import/importStdMd', ...)`.
  - [2026-04-30] **Superseded by §4**: `importStdMd` now gets a proper `EndpointSchema` registered in the registry. Tool uses `ctx.callEndpoint('import.importStdMd', ...)` through the guard chain.
- [2026-04-30] [Decision] **HPath → internal path conversion required for push-md**: `importStdMd` kernel API rejects HPath (silent failure). push-md must convert user's parent HPath to internal `.sy` path via `getIDsByHPath` + `getPathByID` before calling import. Root `"/"` is the only direct-pass case.
- [2026-04-30] [Decision] **`transferBlockRef` rejected for v1 overwrite**: kernel's ref migration rewrites+reindexes every referencing document, causing unacceptable performance impact. push-md v1 refuses overwrite if inbound refs exist. v2 may add opt-in `--force-overwrite` with transferBlockRef.

### User Preferences & Context

- [2026-04-30] [Constraint] **CLI is stateless** — no custom attributes, no persistent binding between local files and SiYuan docs. Caller (agent or human) is responsible for tracking the mapping.
- [2026-04-30] [Constraint] **CLI and SiYuan kernel are typically on the same machine** — `importStdMd` reads local filesystem paths directly. Remote kernel scenario is out of scope for v1.
- [2026-04-30] [Constraint] **`sy-bind-mdfile` pattern as reference, not blueprint** — its `custom-export-md` attribute + putFile + asset deduplication is overengineered for CLI's stateless model. But the `putFile` asset path generation (`assets/Import-{basename}-{id}{ext}`) and `updateBlock` overwrite pattern are useful references.

## Milestones

- [2026-04-30T02:01] Change created; clarify → design phase
- [2026-04-30T15:12] Design aligned: 2 tools (brute-edit + push-md), findReplace excluded, push-md uses importStdMd, search uniqueness + overwrite ref safety added
- [2026-04-30T18:18] Revision 001: 5 behavioral corrections + scope expansion (importStdMd endpoint schema + tests). Plan drafted with 4 phases.
- [2026-04-30T18:30] Implementation complete: 3 new source files, 4 modified files, 16 tests pass.
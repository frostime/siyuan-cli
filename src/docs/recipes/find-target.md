---
title: Find target
summary: Resolve a user-mentioned document or block into a stable SiYuan id before reading or writing.
---

# Goal

Turn a user-visible hint into a stable SiYuan target: document id, block id, notebook id, or stable path.

# Target rule

Do not write to a target found only by title, keyword, or hpath. Resolve candidates → inspect → stabilize to id.

If you reached this recipe directly: confirm workspace first (`siyuan workspace which`).

```text
user hint → workspace/scope → candidate search → inspect → stable id → read/write
```

# Inputs

| User gives | Treat as | First move |
|------------|----------|------------|
| Block/document id | stable id | `get-block-info` directly |
| Notebook name/id | scope | `notebook.lsNotebooks` or tree |
| hpath like `/A/B` | human path | resolve to id, then inspect |
| Document title/name | candidate | `filetree.searchDocs --k "..."` |
| Content phrase | candidate | `search.fullTextSearchBlock "..."` |
| Date/daily note phrase | daily note | `list-dailynote --atDate ...` |

# Default flow

## 1. Narrow scope when possible

If user mentioned a notebook or parent document:

```bash
siyuan api notebook.lsNotebooks
siyuan tool list-doc-tree --entry <notebook-or-doc-id> --depth 2
```

Use bounded depth. Do not load entire workspace tree.

## 2. Search by document title

```bash
siyuan api filetree.searchDocs --k "<title-or-keyword>"
```

Results are candidates, not final targets. `searchDocs` searches document names/paths globally; narrow by notebook with `list-doc-tree`, SQL `box`, or post-filtering returned `box` values.

## 3. Search content when title search is inconclusive

Global search:

```bash
siyuan api search.fullTextSearchBlock "<phrase>"
```

Scoped block grep in a known document/notebook:

```bash
siyuan tool locate-block --id <doc-id> --pattern "%phrase%"
siyuan tool locate-block --box <notebook-id> --pattern "%A%|%B%" --all true
```

Use `locate-block` when editing long documents: it returns matching block ids with breadcrumb/sibling context. Its pattern is SQLite `LIKE`, not regex: wrap substrings with `%...%`; `_` matches one char; multiple patterns use `|`.

## 4. Use SQL for structured constraints

```bash
siyuan api query.sql "SELECT id, hpath, box FROM blocks WHERE type='d' AND content LIKE '%keyword%' LIMIT 10"
```

Always `LIMIT`. Narrow with `box`/`root_id`/`type` before fuzzy `LIKE`.

## 5. Inspect candidate before use

```bash
siyuan tool get-block-info <candidate-id>
siyuan tool get-block-content <candidate-id> --range context --limit 7 --showId true
```

Confirm: title/content matches intent · notebook/scope correct · id is stable · for edits, exact child block id known.

# Common scenarios

**User names a document** ("Open the project roadmap"):
→ `filetree.searchDocs --k "project roadmap"` → inspect candidates with `get-block-info` → stable id

**User gives notebook + title** ("meeting notes in Work"):
→ `notebook.lsNotebooks` → identify notebook id → `list-doc-tree --entry <id> --depth 2` or SQL with `box='<notebook-id>'`

**User gives an hpath** ("/Research/Papers/Transformer"):
→ `filetree.getIDsByHPath --notebook <id> --path "/..."` (if notebook known)
→ SQL fallback: `WHERE type='d' AND hpath = '/...' LIMIT 10` (if notebook unknown)
Convert hpath to id before writes.

**User gives a content phrase** ("the note about approval broker lifecycle"):
→ global: `search.fullTextSearchBlock "approval broker lifecycle"`
→ scoped long-doc search: `locate-block --id <doc-id> --pattern "%approval broker lifecycle%"`
→ `get-block-info` → context read

**User asks for a daily note**:
→ `siyuan tool list-dailynote --atDate yyyy-MM-dd [--notebookId <id>]`
→ For full model: `siyuan doc read siyuan-guide/dailynote-model.md`

**Document has ref links about user's topic**:
→ `get-block-info <doc-id>` → use outgoing refs: `FROM` is the block inside the document, `TO` is the referenced block → read the needed `TO` block by id

**User asks who links to a block**:
→ `search-backlinks <target-id>` → use redirected result ids for Agent navigation; add `--noRedirect true` only when the exact referencing source block is needed

# Success checks

- Stable id obtained for the target document/block
- Candidate belongs to intended notebook/workspace
- Result set narrow enough that user would recognize the target
- For writes: exact document/block id known before editing

# Recovery

**Multiple matches**: ask for notebook, parent path, date, or distinguishing phrase. Inspect 2-3 candidates.

**No matches**: confirm workspace · broaden keyword · try `searchDocs` + `fullTextSearchBlock` · browse bounded tree.

**Search result is child block but user asked for document**: use `get-block-info` → owning document's `root_id`.

# Related docs

- `recipes/read-content.md` — reading after target found
- `recipes/edit-content.md` — editing after target found
- `siyuan-guide/document-tree-and-paths.md` — path semantics
- `siyuan-guide/sql-query-guide.md` — SQL patterns

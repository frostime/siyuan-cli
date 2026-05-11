---
title: Find target
summary: Resolve a user-mentioned document or block into a stable SiYuan id before reading or writing.
---

# Goal

Turn a user-visible hint into a stable SiYuan target: document id, block id, notebook id, or stable path.

Most user requests do not start with an id. They start with phrases like:

- "the project plan document"
- "yesterday's daily note"
- "the paper notes under Research"
- "the section about deployment"

This recipe is the default first step before reading or editing when the target is not already a stable id.

# Target rule

Do not write to a target found only by title, keyword, or hpath. First resolve candidates, inspect the best match, and stabilize to id.

```text
user hint → workspace/scope → candidate search → inspect candidate → stable id → read/write
```

# Inputs

Any of these may be enough to start:

| User gives | Treat as | First move |
|------------|----------|------------|
| Block/document id | stable id | inspect directly |
| Notebook name/id | scope | list notebooks or tree |
| hpath such as `/A/B` | human path | resolve path, then inspect id |
| Document title/name | document candidate | search docs by keyword/title |
| Content phrase | block/document candidate | full-text search, then inspect |
| Date/daily note phrase | daily note candidate | list daily notes by date/scope |

# Default flow

## 1. Confirm workspace

```bash
siyuan workspace which
```

If the workspace is missing or surprising, stop and use `recipes/connect-workspace.md`.

## 2. Narrow scope when possible

If the user mentioned a notebook or parent document, find that scope first.

```bash
siyuan api notebook.lsNotebooks
siyuan tool list-doc-tree --entry <notebook-or-doc-id> --depth 2
```

Use bounded depth. Do not load a whole large workspace tree just to find one document.

## 3. Search by document title or path

For a user-named document, start with document search.

```bash
siyuan api filetree.searchDocs --k "<title-or-keyword>"
```

Use this when the user likely named a document, page, or file. Treat results as candidates, not final targets.

## 4. Search content when title search is inconclusive

Use full-text search when the user gives a phrase that may appear inside content.

```bash
siyuan api search.fullTextSearchBlock "<keyword-or-phrase>"
```

Read promising candidates before acting on them.

## 5. Use SQL for structured constraints

Use SQL when you need notebook/root/type/date/attribute constraints or when search results are too broad.

```bash
siyuan api query.sql "SELECT id, hpath, path, box FROM blocks WHERE type='d' AND content LIKE '%<keyword>%' LIMIT 10"
```

Rules:

- Always `LIMIT`.
- Narrow with `box`, `root_id`, or `type` before fuzzy `LIKE`.
- SQL is read-only for agents.

## 6. Inspect candidate before use

```bash
siyuan tool get-block-info <candidate-id>
siyuan tool get-block-content <candidate-id> --showId true --slice "0:30"
```

Confirm:

- title/path/content matches the user's intent
- notebook/scope is correct
- id is stable enough for follow-up actions
- for edits, the exact child block id is known when needed

# Common scenarios

## User names a document

```text
"Open the project roadmap doc"
```

1. `siyuan workspace which`
2. `siyuan api filetree.searchDocs --k "project roadmap"`
3. If multiple matches, inspect likely candidates with `get-block-info`.
4. Read with `recipes/read-content.md` or edit with `recipes/edit-content.md`.

## User gives a notebook and title

```text
"Find the meeting notes in Work"
```

1. `siyuan api notebook.lsNotebooks`
2. identify notebook id for `Work`
3. `siyuan tool list-doc-tree --entry <notebook-id> --depth 2`
4. use `filetree.searchDocs` or SQL scoped by notebook id if tree is too broad

## User gives an hpath

```text
"Read /Research/Papers/Transformer"
```

```bash
siyuan tool resolve-path --hpath "/Research/Papers/Transformer"
siyuan tool get-block-info <resolved-id>
```

`hpath` is human-readable and rename-sensitive. Convert it to id before writes.

## User gives a content phrase

```text
"Find the note where I wrote about approval broker lifecycle"
```

```bash
siyuan api search.fullTextSearchBlock "approval broker lifecycle"
siyuan tool get-block-info <candidate-block-id>
siyuan tool get-block-content <candidate-root-or-doc-id> --showId true --slice "0:30"
```

If results are noisy, switch to SQL with notebook or document constraints.

## User asks for a daily note

Use the daily note tools/model instead of guessing the path.

```bash
siyuan tool list-dailynote --atDate yyyy-MM-dd [--notebookId <id>]
```

Read `siyuan-guide/dailynote-model.md` when date range or notebook behavior is unclear.

# Success checks

- You have a stable id for the document/block that will be read or written.
- The candidate belongs to the intended notebook/workspace.
- The result set is narrow enough that the user would recognize the target.
- For write operations, the exact document/block id is known before editing.

# Recovery

## Multiple matches

- Ask for notebook, parent path, date, or distinguishing phrase.
- Inspect 2-3 likely candidates instead of guessing.
- Prefer exact id or resolved path before writing.

## No matches

- Confirm workspace with `siyuan workspace which`.
- Broaden the keyword or try a different language/alias.
- Search document titles with `filetree.searchDocs` and content with `search.fullTextSearchBlock`.
- Browse a bounded notebook tree when the user knows the notebook.

## Search result is a child block but user asked for the document

- Inspect the block with `get-block-info`.
- Use its owning document/root id for document-level read/edit.
- Use the child block id only when the user specifically targets that block/section.

# Related docs

- `recipes/read-content.md`
- `recipes/edit-content.md`
- `siyuan-guide/document-tree-and-paths.md`
- `siyuan-guide/sql-query-guide.md`
- `siyuan-guide/dailynote-model.md`

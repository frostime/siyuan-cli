---
title: Read content
summary: Read located documents or blocks safely, with structure inspection, stable ids, and bounded output.
---

# Goal

Read SiYuan document/block content after the target has been located, while preserving enough structure for summarization, quotation, or precise follow-up edits.

If the target is not already a stable id, first use `recipes/find-target.md`.

# When to use

Use this when the user wants to:

- inspect a document or block
- summarize or extract content
- quote content with source ids
- prepare a precise edit
- read a large document without dumping the whole tree

# Reading rule

Choose the smallest read that satisfies the task.

```text
known id → inspect metadata → choose content/source/tree/slice → report partiality if filtered
```

# Inputs

- document id or block id
- optional known scope: notebook, hpath, title, date, or parent document
- optional slice range for large documents

# Default flow

## 1. Confirm target identity

```bash
siyuan tool get-block-info <block-or-doc-id>
```

Check type, path/hpath, notebook, parent/root relation, and whether the id is a document block (`type='d'`) or a child block.

## 2. Read human-oriented content

```bash
siyuan tool get-block-content <block-or-doc-id>
```

Use this for normal review, summary, or extraction.

## 3. Show ids before precise follow-up work

```bash
siyuan tool get-block-content <block-or-doc-id> --showId true
```

Use `--showId true` when:

- the next step may edit a child block
- the user asks about a section inside a document
- you need to cite or compare block-level structure
- search results pointed to a child block but you need surrounding context

## 4. Bound large reads

```bash
siyuan tool get-block-content <block-or-doc-id> --slice "0:30"
```

Use `--slice` for large documents or when only the first part is needed. Continue with additional slices only when the task requires it.

## 5. Read exact source when needed

```bash
siyuan api block.getBlockKramdown --id <block-id>
siyuan api block.getBlockKramdowns --ids '["<id1>","<id2>"]'
```

Use Kramdown/source reads when the user needs exact markup, block refs, attributes, or preparation for update operations. Prefer batch reads when you already have multiple known ids.

# Common scenarios

## User asks to summarize a named document

1. Locate target with `recipes/find-target.md`.
2. `siyuan tool get-block-info <doc-id>`.
3. `siyuan tool get-block-content <doc-id> --slice "0:50"` for a bounded first pass.
4. Continue only if the summary requires later sections.

## User asks to edit a paragraph or section

1. Locate the document or candidate block.
2. Read with ids:
   ```bash
   siyuan tool get-block-content <doc-id> --showId true
   ```
3. Identify the exact child block id.
4. Continue with `recipes/edit-content.md`.

## User gives a block id

```bash
siyuan tool get-block-info <block-id>
siyuan tool get-block-content <block-id> --showId true
```

If the task needs the containing document, use metadata from `get-block-info` to move from child block to root/document context.

## User asks for exact Markdown/Kramdown

```bash
siyuan api block.getBlockKramdown --id <block-id>
```

Use this when exact source matters more than readable rendered content.

## User asks to compare multiple known blocks

```bash
siyuan api block.getBlockKramdowns --ids '["<id1>","<id2>","<id3>"]'
```

Prefer batch reads instead of looping single calls.

# Output rules

- If `CONTENT_FILTERED` appears, tell the user the result is a partial view under current permission rules.
- Do not say "there are no more items" unless the command returned an unfiltered bounded result that supports that claim.
- For large documents, state the slice or scope read.
- For edit preparation, include the relevant stable ids in your working notes or response when useful.

# Success checks

- The returned content matches the intended target.
- The read scope is bounded enough for the task.
- Block ids are visible when precise follow-up targeting is needed.
- The user can tell whether the answer came from a complete or partial view.

# Recovery

## Block not found

- confirm the workspace with `siyuan workspace which`
- re-resolve the target from hpath, notebook, title, or search using `recipes/find-target.md`
- check whether the id is from another workspace

## Content too large

- switch to `--slice`
- read the tree or table of contents first via `get-block-info`
- ask the user for the relevant section when the document is too large and the task is broad

## Result lacks enough structure for editing

- re-read with `--showId true`
- use exact source with `block.getBlockKramdown` for the target block
- then continue with `recipes/edit-content.md`

## Result is filtered

- report partial view
- ask for a narrower authorized target or permission change only if the task cannot be completed from visible content

# Related docs

- `recipes/find-target.md`
- `recipes/edit-content.md`
- `siyuan-guide/siyuan-block.md`
- `siyuan-guide/document-tree-and-paths.md`
- `cli-usage/permission.md`

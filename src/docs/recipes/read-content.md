---
title: Read content
summary: Read located documents or blocks safely, with structure inspection, stable ids, and bounded output.
---

# Goal

Read SiYuan document/block content after the target has been located, preserving enough structure for summarization, quotation, or precise follow-up edits.

If the target is not already a stable id → `recipes/find-target.md` first.

# Reading rule

Choose the smallest read that satisfies the task.

If you reached this recipe directly: confirm workspace first (`siyuan workspace which`); ensure target is a stable id (see `recipes/find-target.md`).

```text
known id → get-block-info → choose bounded range → read → report partiality if filtered/truncated
```

# Range selection

| Range | Use when | Default limit |
|-------|----------|---------------|
| `self` | Only the anchor block itself | 1 |
| `children` | Child blocks of document/heading/container | 30 |
| `context` | Sibling window around anchor (includes anchor) | 7 |
| `before` | Siblings before anchor | — |
| `after` | Siblings after anchor | — |

```bash
siyuan tool get-block-content <id> --range self
siyuan tool get-block-content <id> --range children --limit 50
siyuan tool get-block-content <id> --range context --limit 7 --showId true
siyuan tool get-block-content <id> --range children --limit=-1              # full read
siyuan tool get-block-content <id> --range children --limit=-1 --bodyOnly true > /tmp/doc.md
```

Use `--limit=-1` only when the task needs the full range. Run `get-block-content --help` for all parameters.

# When to use --showId true

Use when:
- Next step may edit a child block
- User asks about a section inside a document
- Need to cite or compare block-level structure
- Search pointed to a child block and you need surrounding context

⚠️ `--showId true` injects `@@id@@type` markers. These are not source text — never use as brute-edit search/overwrite content.

# When to use --bodyOnly true

Use when piping clean Markdown to a local file for round-trip editing. Removes the metadata header and BEGIN marker. Not for partiality diagnostics.

# Exact source reads

```bash
siyuan api block.getBlockKramdown --id <id>              # exact Kramdown source
siyuan api block.getBlockKramdowns --ids '["<id1>","<id2>"]'  # batch
```

Use when exact markup, block refs, or attributes matter. Prefer batch for multiple known ids.

# Output rules

- `CONTENT_FILTERED` → partial view under permission rules. Report to user; don't infer absence.
- Header `truncated: true` → bounded result. Continue only when needed.
- Header `limit: unlimited` → intentional full read.
- Content after `--- BEGIN BLOCK CONTENT ---` = raw Markdown.
- Content after `--- BEGIN ANNOTATED BLOCK CONTENT ---` = annotated (for targeting only).

# Common scenarios

**Summarize a document**: `get-block-info` → `get-block-content --range children --limit 50` → if incomplete, `--limit=-1`.

**Prepare a precise edit**: for long docs, `locate-block --id <doc-id> --pattern "%phrase%"` (SQLite `LIKE`, not regex) → read matched block context with `get-block-content --range context --limit 7 --showId true` → continue with `recipes/edit-content.md`.

**Compare multiple blocks**: `block.getBlockKramdowns --ids '[...]'` — batch read.

**Navigate from child to document**: `get-block-info` → use `root_id` for document-level operations.

# Recovery

**Block not found**: confirm workspace · re-resolve via `recipes/find-target.md` · check if id is from another workspace.

**Content too large**: reduce `--limit` · use `context`/`before`/`after` around known block · ask user for relevant section.

**Result lacks structure for editing**: re-read with `--showId true` · use `block.getBlockKramdown` for exact source.

**Result is filtered**: report partial view · ask for narrower target or permission change only if task cannot complete from visible content.

# Related docs

- `recipes/find-target.md` — resolve targets
- `recipes/edit-content.md` — editing after reading
- `siyuan-guide/siyuan-block.md` — block model
- `cli-usage/permission.md` — permission filtering

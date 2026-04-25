---
title: Read content
summary: Read document or block content safely, with structure inspection and optional slice-based paging.
---

# Goal

Inspect document or block content in a way that preserves enough structure for later targeting or editing.

# When to use

Use this when the user wants content review, extraction, analysis, or preparation for precise edits.

# Inputs

- block id or document id
- optional slice range for large documents

# Steps

1. Inspect block metadata.
2. Read content.
3. Use `--showId` for precise child targeting.
4. Use `--slice` for large document paging.

# Commands

```bash
siyuan tool get-block-info <block-or-doc-id>
siyuan tool get-block-content <block-or-doc-id>
siyuan tool get-block-content <block-or-doc-id> --showId true
siyuan tool get-block-content <block-or-doc-id> --slice "0:30"
```

# Success checks

- the returned content matches the intended target
- block ids are visible when precise follow-up targeting is needed
- large content is paged into manageable slices

# Recovery

## Block not found

- confirm the workspace
- re-resolve the target from hpath, notebook, or SQL search

## Content too large

- switch to `--slice`
- page from a known child block id for continuation

# Related docs

- `recipes/find-target.md`
- `siyuan-guide/siyuan-block.md`
- `cli-usage/cli-overview.md`

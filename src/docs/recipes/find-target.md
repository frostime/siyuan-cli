---
title: Find target
summary: Locate a document or block from an id, path, hpath, notebook, or keyword.
---

# Goal

Resolve a user-visible hint into a stable SiYuan target such as a document id, block id, or stable path.

# When to use

Use this when the user gives a title, keyword, notebook, hpath, or partial location instead of a stable id.

# Inputs

- one of: block id, document id, hpath, notebook id, keyword

# Steps

1. If you already have an id, inspect it directly.
2. If you have an hpath, resolve it to a stable path.
3. If you have a notebook, inspect the tree.
4. If you only have a keyword, run a scoped SQL query.

# Commands

```bash
siyuan tool resolve-path --hpath "/private/diary"
siyuan tool list-doc-tree --notebook <notebook-id>
siyuan tool get-block-info <block-or-doc-id>
siyuan api query.sql "SELECT id, hpath, path FROM blocks WHERE type='d' AND content LIKE '%keyword%' LIMIT 10"
```

# Success checks

- you have a stable id or path for the target
- the target belongs to the intended notebook or document scope
- the result set is narrow enough for safe follow-up actions

# Recovery

## Multiple matches

- add notebook, root_id, or type constraints
- prefer exact id or resolved path before writing

## No matches

- broaden the keyword
- switch from `content` search to tree inspection
- confirm the workspace and notebook scope

# Related docs

- `siyuan-guide/document-tree-and-paths.md`
- `siyuan-guide/sql-query-guide.md`
- `cli-usage/cli-overview.md`

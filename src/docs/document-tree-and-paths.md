---
title: Document Tree and Path Semantics
slug: document-tree-and-paths
summary: Explain document IDs, notebook IDs, path vs hpath, and how SiYuan document hierarchy maps to filesystem layout.
---

# Document Tree and Path Semantics

A document block records:

- document id
- notebook id (`box`)
- notebook-local `path`
- human-readable `hpath`

## Physical layout

Example filesystem path:

```text
/data/20260101215354-j0c5gvk/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
     └── notebook id ──┘          └── parent doc id ──┘           └── doc id ──┘
```

## Example block fields

```json
{
  "id": "20260107143334-l5eqs5i",
  "box": "20260101215354-j0c5gvk",
  "root_id": "20260107143334-l5eqs5i",
  "content": "文档结构",
  "hpath": "/思源笔记开发/文档结构",
  "path": "/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy",
  "type": "d"
}
```

## path vs hpath

### `path`
- ID-based path
- unique inside a notebook
- stable for automation and permissions

### `hpath`
- human-readable name path
- readable for people
- may repeat when documents share titles

## Practical rule

For automation, permission rules, and stable references:
- prefer `id`
- prefer `path`

For user-facing output:
- prefer `hpath`

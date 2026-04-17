---
title: Document Tree and Path Semantics
slug: document-tree-and-paths
summary: Explain id, parent_id, root_id, notebook id, path vs hpath, and how SiYuan block hierarchy differs from document file layout.
---

# Document Tree and Path Semantics

The focus of this page is not the filesystem itself, but **how the block tree maps to document paths**.

## 1. Distinguish three different relationships first

### Block tree relationship

These fields describe the block hierarchy:

- `id`: the current block
- `parent_id`: the direct parent block
- `root_id`: the document block that owns this block

### Document ownership relationship

These fields describe document ownership:

- `box`: the notebook ID
- `root_id`: the owning document block ID

### Document path relationship

These fields describe document-level paths:

- `path`: the ID-based path of the document
- `hpath`: the human-readable path of the document

## 2. One important clarification

**`path` and `hpath` are not fields exclusive to document blocks, and they are not standalone paths for individual blocks.**

More precisely:

- many block records may carry `path` and `hpath`
- both fields describe the path of the **document that contains the block**
- the hierarchy of a block is determined by `parent_id`
- document membership is determined by `root_id`

So, do not use `path` to infer parent-child relationships between blocks.

## 3. Example: document block

Example filesystem path:

```text
/data/20260101215354-j0c5gvk/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
     └── notebook id ──┘          └── parent doc id ──┘           └── doc id ──┘
```

Example document block record:

```json
{
  "id": "20260107143334-l5eqs5i",
  "box": "20260101215354-j0c5gvk",
  "root_id": "20260107143334-l5eqs5i",
  "content": "Document Structure",
  "hpath": "/SiYuan Development/Document Structure",
  "path": "/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy",
  "type": "d"
}
```

### Properties of a document block

- `type = 'd'`
- `root_id = id`
- `parent_id` is empty
- `path` points to the `.sy` file for that document

## 4. How to understand paths for non-document blocks

For ordinary blocks such as paragraphs, headings, and list items:

- `id`: the block's own ID
- `parent_id`: its direct parent block
- `root_id`: the document block that contains it
- `path`: the file path of the containing document
- `hpath`: the human-readable path of the containing document

In other words:

- a paragraph block has its own `id`
- but it does not correspond to an independent `.sy` file
- it inherits the `path` and `hpath` of its containing document

## 5. `path` vs `hpath`

### `path`

- an ID-based document path
- stable within a notebook
- better for automation, permissions, caching, and programmatic use

### `hpath`

- a human-readable path
- better for user-facing output
- may change because of renaming or duplicate titles
- should not be treated as a unique stable key

## 6. `parent_id` vs `root_id`

### `parent_id`

Use `parent_id` to determine:

- the direct parent of a block
- the direct children of a block
- how the block tree should be expanded

### `root_id`

Use `root_id` to determine:

- which document a block belongs to
- which blocks belong to a given document
- how to limit query scope to a document context

## 7. Agent rules

### For stable addressing

Recommended priority:

1. `id`
2. `root_id`
3. `path`

### For user-facing output

Prefer to show:

- `hpath`
- the document title
- a block link when needed

### For tree-structure reasoning

- use `parent_id`
- do not use `path`

### For document-scope filtering

- use `root_id`
- do not rely on `hpath` alone

## 8. One-sentence summary

- `parent_id` answers **parent-child block relationships**
- `root_id` answers **which document a block belongs to**
- `path` and `hpath` answer **how to locate the containing document**

These three concerns should not be mixed.

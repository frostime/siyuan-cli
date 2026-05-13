---
title: Document Tree and Path Semantics
slug: document-tree-and-paths
summary: id, parent_id, root_id, box, path vs hpath — how the block tree maps to document paths.
---

# Document Tree and Path Semantics

How the block tree maps to document paths.

**Stable addressing priority: id > root_id > path.** Never use hpath or title as a stable key for programmatic use.

## 1. Three relationships

| Relationship | Fields | Answers |
|-------------|--------|---------|
| Block tree | `id`, `parent_id`, `root_id` | Parent-child hierarchy, document ownership |
| Document ownership | `box`, `root_id` | Which notebook, which document |
| Document path | `path`, `hpath` | How to locate the containing document |

## 2. `path` and `hpath` semantics

**Rule:** `path` and `hpath` on any block describe the **containing document**, not the block itself.

- Multiple blocks share the same `path`/`hpath` (they live in the same document).
- Block hierarchy is determined by `parent_id`, not `path`.
- Document membership is determined by `root_id`.

## 3. `path` vs `hpath`

| | `path` | `hpath` |
|---|--------|---------|
| Format | ID-based (`/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy`) | Title-based (`/SiYuan Development/Document Structure`) |
| Stability | Stable within notebook | Changes on rename or duplicate titles |
| Use for | Automation, permissions, caching | User-facing display |
| As unique key | ✓ | ✗ |

## 4. `parent_id` vs `root_id`

| | `parent_id` | `root_id` |
|---|-------------|-----------|
| Answers | Direct parent/children of a block | Which document owns the block |
| Use for | Tree traversal, expand/collapse | Document-scope filtering, ownership |

## 5. Example: document block

Filesystem path:

```text
/data/20260101215354-j0c5gvk/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
     └── notebook id ──┘          └── parent doc id ──┘           └── doc id ──┘
```

Block record:

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

Document block properties: `type='d'`, `root_id = id`, `parent_id` empty, `path` points to its `.sy` file.

## 6. CLI tool & API mapping

### Path resolution

| Task | Command |
|------|---------|
| Resolve hpath → ids (notebook-scoped) | `siyuan api filetree.getIDsByHPath --notebook <id> --path "/private/diary"` |
| Resolve id → storage path | `siyuan api filetree.getPathByID --id <id>` |
| Resolve id → hpath | `siyuan api filetree.getHPathByID --id <id>` |
| Resolve path → hpath | `siyuan api filetree.getHPathByPath --notebook <id> --path "/..."` |
| Resolve hpath globally (fallback) | `siyuan api query.sql "SELECT id, box, path, hpath FROM blocks WHERE type='d' AND hpath='/private/diary' LIMIT 10"` |
| Resolve id → full info | `siyuan api filetree.getPathByID --id <id>` + `siyuan api filetree.getHPathByID --id <id>` |

### Document tree navigation

| Task | Command |
|------|---------|
| List doc tree under notebook | `siyuan tool list-doc-tree --entry <notebook-id>` |
| List doc tree under document | `siyuan tool list-doc-tree --entry <document-id>` |
| List docs by path | `siyuan api filetree.listDocsByPath --notebook <id> --path "/..."` |
| Search documents | `siyuan api filetree.searchDocs --k "..."` |

### Notebook management

| Task | Command |
|------|---------|
| List all notebooks | `siyuan api notebook.lsNotebooks` |
| Create notebook | `siyuan api notebook.createNotebook --name "New"` |
| Rename notebook | `siyuan api notebook.renameNotebook --notebook <id> --name "New"` |
| Remove notebook | `siyuan api notebook.removeNotebook --notebook <id>` |

### Document CRUD

| Task | Command |
|------|---------|
| Create doc with markdown | `siyuan api filetree.createDocWithMd --notebook <id> --path "/foo/bar" --markdown "# Title"` |
| Rename doc by ID | `siyuan api filetree.renameDocByID --id <id> --title "New Title"` |
| Rename by path | `siyuan api filetree.renameDoc --notebook <id> --path "/..." --title "..."` |
| Move doc by ID | `siyuan api filetree.moveDocsByID --fromIDs '["<id>"]' --toID <target-id>` |
| Remove doc by ID | `siyuan api filetree.removeDocByID --id <id>` |

All commands support `--help`. Use `--dry-run` to preview destructive writes.

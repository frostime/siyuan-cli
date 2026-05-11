---
title: Edit content
summary: Safely inspect, choose an edit strategy, update SiYuan content, and verify the result.
---

# Goal

Modify existing SiYuan content with a stable target, explicit pre-flight inspection, and post-write verification.

# Scope

Use this recipe for:

- appending or inserting Markdown into a known document/block
- updating one known block
- updating multiple known blocks atomically
- controlled whole-document search-and-replace
- moving a block to a new position within or across documents
- moving a document to a different parent in the document tree

This recipe is not a block-type handbook. For the SiYuan data model, read `siyuan-guide/siyuan-block.md`. For target discovery, read `recipes/find-target.md` first.

# Pre-flight

Before any write, confirm the workspace and inspect the target.

```bash
siyuan workspace which
siyuan tool get-block-info <block-or-doc-id>
siyuan tool get-block-content <block-or-doc-id> --showId true
```

Use `--showId true` when you need to edit a specific child block.

# Strategy selector

| Goal | Prefer | Notes |
|------|--------|-------|
| Append content to a known document/block/daily note | `siyuan tool append-content` | Safest path when existing content should remain unchanged |
| Replace one known block | `siyuan api block.updateBlock` | Use a block id, not a title or fuzzy match |
| Replace multiple known blocks | `siyuan api block.batchUpdateBlock` | Atomic multi-block update |
| Insert before/after a known block | `siyuan api block.insertBlock --nextID/--previousID` | Use `--parentID` when the parent is known |
| Append/prepend under a parent block | `siyuan api block.appendBlock` / `block.prependBlock` | Creates new child blocks |
| Whole-document search-and-replace | `siyuan tool brute-edit` | High-risk path; use only when ID churn is acceptable |
| Move a block to a new position | `siyuan api block.moveBlock` | Block id is preserved; `--previousID` anchors position, `--parentID` is the container |
| Move a document to another parent | `siyuan api filetree.moveDocsByID` | hpath changes; `id` and content are preserved |
| Delete a document | `siyuan api filetree.removeDocByID` | Prefer over deleting a document block |

# Side effects

| Operation | Existing child block IDs | Main risk |
|-----------|--------------------------|-----------|
| `block.updateBlock` on a leaf/container child | Target id usually remains | Markdown may change the block type |
| `block.batchUpdateBlock` on child blocks | Target ids remain | Wrong id updates the wrong block atomically |
| `block.updateBlock` / `batchUpdateBlock` on a document block (`type='d'`) | Child tree is replaced | Existing child ids, refs, and attributes may be invalidated |
| `insertBlock` / `appendBlock` / `prependBlock` | Existing ids remain; new content gets new ids | Insert position must be correct |
| `moveBlock` | Moved block id remains | Document structure changes |
| `filetree.moveDocsByID` | All block ids remain | `hpath` changes; any hardcoded hpath references become stale |
| `brute-edit` | Child block ids are regenerated | Unsafe for documents whose child blocks are referenced or attributed |

# Commands

## Append content

```bash
siyuan workspace which
siyuan tool append-content \
  --targetId <doc-or-block-id> \
  --targetType document \
  --markdown @stdin \
  --dry-run <<'EOF'
## New section

Paragraph content here.
EOF

siyuan tool append-content \
  --targetId <doc-or-block-id> \
  --targetType document \
  --markdown @stdin \
  --yes <<'EOF'
## New section

Paragraph content here.
EOF
```

Use `--targetType block` for block targets and `--targetType dailynote` when `--targetId` is a notebook id.

## Replace one block

```bash
siyuan workspace which
siyuan tool get-block-content <doc-id> --showId true

siyuan api block.updateBlock \
  --id <block-id> \
  --dataType markdown \
  --data @stdin \
  --yes <<'EOF'
Replacement markdown content here.
EOF

siyuan tool get-block-content <doc-id> --showId true
```

Use `@file:./content.md` instead of `@stdin` when content already lives in a file.

## Replace multiple blocks

```bash
siyuan workspace which
siyuan tool get-block-content <doc-id> --showId true

cat > blocks.json <<'EOF'
[
  { "id": "<block-id-1>", "data": "New content 1", "dataType": "markdown" },
  { "id": "<block-id-2>", "data": "New content 2", "dataType": "markdown" }
]
EOF

siyuan api block.batchUpdateBlock --blocks @file:./blocks.json --dry-run
siyuan api block.batchUpdateBlock --blocks @file:./blocks.json --yes

siyuan tool get-block-content <doc-id> --showId true
```

Default to `dataType: "markdown"`. Use `dom` only when DOM-level editing is explicitly required.

## Insert before or after a block

```bash
# Insert before <next-block-id>
siyuan api block.insertBlock \
  --parentID <parent-id> \
  --nextID <next-block-id> \
  --dataType markdown \
  --data @stdin \
  --yes <<'EOF'
Inserted before the target block.
EOF

# Insert after <previous-block-id>
siyuan api block.insertBlock \
  --parentID <parent-id> \
  --previousID <previous-block-id> \
  --dataType markdown \
  --data @stdin \
  --yes <<'EOF'
Inserted after the target block.
EOF
```

## Whole-document search-and-replace

```bash
siyuan workspace which
siyuan tool get-block-info <doc-id>

siyuan tool brute-edit <doc-id> \
  --replacements @stdin \
  --dry-run <<'EOF'
[
  {"search": "old heading", "replace": "new heading"},
  {"search": "deprecated term", "replace": "updated term"}
]
EOF

# If replacements are already in a file, one @file form is enough
siyuan tool brute-edit <doc-id> \
  --replacements @file:./replacements.json \
  --yes

siyuan tool get-block-content <doc-id> --showId true
```

Only use this when regenerating child block ids is acceptable.

## Move a block

```bash
siyuan workspace which
siyuan tool get-block-info <block-id>   # confirm target block and its current parent

# Move to after a known sibling (most common)
siyuan api block.moveBlock --id <block-id> --previousID <sibling-id> --parentID <parent-id>

# Move to first child of a parent (previousID must be empty string)
siyuan api block.moveBlock --id <block-id> --previousID "" --parentID <parent-id>

siyuan tool get-block-info <block-id>   # verify new parent
```

`--previousID` anchors the position (the block that will precede the moved block); `--parentID` is the container. Both are required by the CLI. To move to the first child position, pass `--previousID ""`.

## Move a document

```bash
siyuan workspace which
siyuan tool get-block-info <doc-id>   # confirm current location

# Move one or more documents under a new parent document or notebook root
siyuan api filetree.moveDocsByID \
  --fromIDs '["<doc-id>"]' \
  --toID <target-parent-doc-or-notebook-id>

siyuan tool resolve-path --id <doc-id>   # verify new hpath
```

`--toID` accepts either a document id (move inside that document) or a notebook id (move to notebook root). The block id and all content are preserved; only `hpath` and `path` change.

# Verification

After writing:

```bash
siyuan tool get-block-content <doc-or-block-id> --showId true
```

Check that:

- the intended target changed
- neighboring sibling content did not change unexpectedly
- the resulting block ids are known when follow-up edits are needed
- the target still belongs to the intended workspace/notebook/document

# Recovery

## Wrong target risk

- re-run `siyuan workspace which`
- re-run `siyuan tool get-block-info <id>`
- read content with `--showId true`
- narrow to a stable block id before retrying

## Write denied or approval required

- inspect permission rules with `siyuan workspace which`
- if the Approval Center opens, approve or reject the request there
- `siyuan approval list` shows pending requests and their ids
- retry with `--yes` only when the action is intended and safe
- if `behavior.allowYes` is `false`, approve via the Approval Center instead

# Related docs

- `recipes/find-target.md`
- `recipes/read-content.md`
- `siyuan-guide/siyuan-block.md`
- `cli-usage/workspace-config.md`
- `cli-usage/permission.md`

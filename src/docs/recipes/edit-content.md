---
title: Edit content
summary: Safely locate a document or block, inspect it, update content, and verify the result.
---

# Goal

Modify existing SiYuan content with a stable target, explicit inspection, and post-write verification.

# When to use

Use this when the user wants to update an existing document or block instead of only appending new content.

# Inputs

- target document id or block id
- replacement markdown or inserted markdown
- enough context to verify the correct target

# Steps

1. Confirm workspace resolution.
2. Resolve the target to a stable id.
3. Inspect metadata and content.
4. Choose the write path: single block → `updateBlock`; multiple blocks → `batchUpdateBlock`; whole-document plain-text replace with no child refs → `brute-edit`.
5. Apply the write. For safe writes: dry-run first, then execute.
6. Read back the result.

# Commands

## Replace single block content

```bash
siyuan workspace which
siyuan tool get-block-info <block-id>
siyuan tool get-block-content <block-id> --showId true

# heredoc (preferred for inline content)
siyuan api block.updateBlock --id <block-id> --dataType markdown --data @stdin <<'EOF'
Replacement markdown content here.
EOF

# or from file
siyuan api block.updateBlock --id <block-id> --data @file:./content.md --dataType markdown

siyuan tool get-block-content <block-id>
```

## Batch replace multiple blocks

Use `batchUpdateBlock` for atomic multi-block edits — prefer `dataType: "markdown"`.

```bash
siyuan workspace which
siyuan tool get-block-content <doc-id> --showId true

# Prepare a JSON payload file
cat > blocks.json <<'EOF'
[
  { "id": "<block-id-1>", "data": "New content 1", "dataType": "markdown" },
  { "id": "<block-id-2>", "data": "New content 2", "dataType": "markdown" }
]
EOF

# Dry-run first, then execute
siyuan api block.batchUpdateBlock --blocks @file:./blocks.json --dry-run
siyuan api block.batchUpdateBlock --blocks @file:./blocks.json --yes

siyuan tool get-block-content <doc-id>
```

Caution: updating a document block (`type='d'`) with `batchUpdateBlock` replaces the document's entire child tree.

## Full-document brute-edit

Rewrites the whole document via search-and-replace. Child block IDs are regenerated — only safe when no child blocks hold custom attributes or inbound references.

```bash
siyuan workspace which
siyuan api block.batchUpdateBlock --blocks @stdin --dry-run <<'EOF'
[{"id":"<doc-id>","data":"# Title\n\nNew body...","dataType":"markdown"}]
EOF

# Or use the brute-edit tool for search-replace pairs
siyuan tool brute-edit <doc-id> --replacements '[{"search":"old text","replace":"new text"}]' --dry-run
siyuan tool brute-edit <doc-id> --replacements '[{"search":"old text","replace":"new text"}]' --yes

siyuan tool get-block-content <doc-id>
```

## Append content with preview

```bash
siyuan workspace which
siyuan tool get-block-info <doc-or-block-id>
siyuan tool append-content --targetId <doc-or-block-id> --targetType document --markdown @file:./append.md --dry-run
siyuan tool append-content --targetId <doc-or-block-id> --targetType document --markdown @file:./append.md
siyuan tool get-block-content <doc-or-block-id>
```

# Success checks

- the target id is confirmed before writing
- the intended block or document changed
- read-back content reflects the intended update
- no unexpected sibling content changed

# Recovery

## Wrong target risk

- re-run `get-block-info`
- use `get-block-content --showId true`
- narrow to block id before retrying

## Write denied or approval required

- inspect permission rules
- if the Approval Center opens, approve or reject the request there
- `siyuan approval list` shows pending requests and their ids
- retry with `--yes` only when the action is intended and safe
- if `behavior.allowYes` is `false`, `--yes` is disabled; approve via the Approval Center instead

# Related docs

- `recipes/find-target.md`
- `recipes/read-content.md`
- `siyuan-guide/siyuan-block.md`
- `cli-usage/workspace-config.md`

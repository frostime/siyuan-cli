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
4. Choose the write path.
5. Apply the write.
6. Read back the result.

# Commands

## Replace existing block content

```bash
siyuan workspace which
siyuan tool get-block-info <block-id>
siyuan tool get-block-content <block-id> --showId true
siyuan api block.updateBlock --id <block-id> --data @file:./content.md --dataType markdown
siyuan tool get-block-content <block-id>
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

# Related docs

- `recipes/find-target.md`
- `recipes/read-content.md`
- `siyuan-guide/siyuan-block.md`
- `cli-usage/config-and-permission.md`

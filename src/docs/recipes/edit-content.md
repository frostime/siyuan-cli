---
title: Edit content
summary: Safely inspect, choose an edit strategy, update SiYuan content, and verify the result.
---

# Goal

Modify SiYuan content with stable targets, pre-flight inspection, and post-write verification.

Use for: append/insert, block update, batch update, document rewrite, create/move/delete. Data model → `siyuan-guide/siyuan-block.md`; target discovery → `recipes/find-target.md`.

# Pre-flight

For any non-append write:

```bash
siyuan workspace which
siyuan tool get-block-info <id>
siyuan tool get-block-content <id> --range context --limit 7 --showId true
siyuan tool locate-block --id <doc-id> --pattern "%target text%"  # SQL LIKE, not regex
```

Direct-entry checklist: confirm workspace · stabilize target id · inspect before modify. Full rationale: SKILL §Safety anchors.

# Strategy selector

| Goal | Command | Key notes |
|------|---------|-----------|
| Append to known doc/block | `block.appendBlock` | Fast path. `--parentID`, `--data`. |
| Append to daily note | `block.appendDailyNoteBlock` | `--notebook` required. |
| Replace one known block | `block.updateBlock` | Requires stable block id. |
| Replace multiple known blocks | `block.batchUpdateBlock` | Atomic. JSON array of `{id, data, dataType}`. |
| Insert before/after a block | `block.insertBlock` | `--nextID` or `--previousID` + `--parentID`. |
| Prepend under parent | `block.prependBlock` | Creates new first child. |
| Broad document-level rewrite | `brute-edit --check` → `--dry-run` → `--yes` | Only if SAFE. Regenerates child ids. |
| Whole-document overwrite | `brute-edit --overwrite` | Same safety checks as brute-edit. |
| Create new document | `filetree.createDocWithMd` | `--notebook`, `--path`, `--markdown`. |
| Move a block | `block.moveBlock` | `--id`, `--previousID`, `--parentID`. |
| Move a document | `filetree.moveDocsByID` | hpath changes; id preserved. |
| Delete a document | `filetree.removeDocByID` | Prefer over deleting document block. |

Run `siyuan api <command> --help` for parameters and INPUT SOURCES.

# Side effects

> ⚠️ `updateBlock` on a document block (`type='d'`) replaces the entire child tree. Child ids, refs, and custom attrs are invalidated. For document rewrites, prefer `brute-edit --check true`.

| Operation | Child block IDs | Risk |
|-----------|----------------|------|
| `updateBlock` on leaf/container child | Target id usually remains | May change block type |
| `batchUpdateBlock` on children | Target ids remain | Wrong id → wrong block updated atomically |
| `updateBlock` on document block (`type='d'`) | **Child tree replaced** | Existing child ids/refs/attrs invalidated |
| `insertBlock` / `appendBlock` / `prependBlock` | Existing ids remain | Insert position must be correct |
| `moveBlock` | Moved block id remains | Document structure changes |
| `filetree.moveDocsByID` | All block ids remain | hpath changes |
| `brute-edit` / `--overwrite` | **Child ids regenerated** | Refuses docs with child attrs, inbound refs, or excessive size |

# Commands

## Append content

Fast path for append-only operations.

```bash
siyuan api block.appendBlock --parentID <id> --data @stdin --yes <<'EOF'
## New section
Content.
EOF
```

`dataType` defaults to `markdown`. Use `--dry-run` if parent id was just resolved. For multi-line content, prefer `@stdin` (heredoc / here-string) or `@file:` over inline `--data`; shell does not interpret `\n` as a newline inside quoted strings.

Daily notes are per-notebook: `block.appendDailyNoteBlock --notebook <id>`. If notebook id is unknown, run `notebook.lsNotebooks`; if multiple plausible notebooks, ask.

## Replace one or multiple blocks

```bash
# Single block (run --help for params)
siyuan api block.updateBlock --id <block-id> --dataType markdown --data @stdin --yes <<'EOF'
Replacement content.
EOF

# Multiple blocks atomically (JSON array via @file: or heredoc)
siyuan api block.batchUpdateBlock --blocks @file:./blocks.json --dry-run
siyuan api block.batchUpdateBlock --blocks @file:./blocks.json --yes
```

`blocks.json`: `[{"id":"...","data":"...","dataType":"markdown"}, ...]`. Default `markdown`; use `dom` only for DOM-level edits.

## Insert before or after

```bash
# Insert after a sibling
siyuan api block.insertBlock --parentID <parent-id> --previousID <sibling-id> \
  --dataType markdown --data @stdin --yes <<'EOF'
Inserted content.
EOF
```

Use `--nextID` to insert before. Full params: `block.insertBlock --help`.

## Create a document

```bash
siyuan api filetree.createDocWithMd --notebook <notebook-id> --path "/path/to/doc" \
  --markdown @file:./content.md
```

⚠️ Git Bash/MSYS may rewrite leading `/`; use `MSYS_NO_PATHCONV=1` or `//path`.

## Broad document-level rewrite (brute-edit)

Use only when block-level edits are fragile/inefficient. Always check first.

```bash
# 1. Check safety
siyuan tool brute-edit <doc-id> --check true --print json

# UNSAFE → checkpoint + block-level fallback
siyuan tool checkpoint-doc <doc-id>

# SAFE → preview, then execute
siyuan tool brute-edit <doc-id> --replacements @file:./replacements.json --dry-run
siyuan tool brute-edit <doc-id> --replacements @file:./replacements.json --yes
```

`replacements.json`: `[{"search":"old text","replace":"new text"}, ...]`
Each search must match exactly once. Overlapping or missing matches reject the operation.

## Whole-document overwrite

```bash
siyuan tool brute-edit <doc-id> --check true --print json
# If SAFE:
siyuan tool get-block-content <doc-id> --range children --limit=-1 --bodyOnly true > "$TMPDIR/doc.md"
# ... edit $TMPDIR/doc.md locally ...
siyuan tool brute-edit <doc-id> --overwrite @file:$TMPDIR/doc.md --dry-run
siyuan tool brute-edit <doc-id> --overwrite @file:$TMPDIR/doc.md --yes
rm "$TMPDIR/doc.md"
```

Never overwrite from `--showId true` output; markers are not source text.

## Move a block

```bash
siyuan api block.moveBlock --id <block-id> --previousID <sibling-id> --parentID <parent-id>
# Move to first child: --previousID ""
```

## Move a document

```bash
siyuan api filetree.moveDocsByID --fromIDs '["<doc-id>"]' --toID <target-parent-id>
```

`--toID`: document id (move inside) or notebook id (move to root). Block ids preserved; hpath changes.

# Verification

After writing:

```bash
siyuan tool get-block-content <id> --range context --limit 7 --showId true
```

Confirm: intended target changed · neighbors unchanged · follow-up ids known · correct workspace/notebook.

# Recovery

**Wrong target**: re-run `workspace which` + `get-block-info` + bounded read; narrow to stable block id before retry.

**Denied / approval required**: inspect rules with `workspace which`; approve/reject in Approval Center or `siyuan approval list`. Retry with `--yes` only when intended and allowed.

# Related docs

- `recipes/find-target.md` — resolve user hints to stable ids
- `recipes/read-content.md` — bounded reading with id awareness
- `siyuan-guide/siyuan-block.md` — block types, attributes, Markdown extensions
- `cli-usage/permission.md` — permission rules and debugging

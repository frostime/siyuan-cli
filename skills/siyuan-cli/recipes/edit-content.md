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
siyuan-cli current which
siyuan-cli tool get-block-info <id>
siyuan-cli tool get-block-content <id> --range context --limit 7 --showId true
siyuan-cli tool locate-block --id <doc-id> --pattern "%target text%"  # SQL LIKE, not regex
```

Direct-entry checklist: confirm workspace · stabilize target id · inspect before modify. Full rationale: SKILL §Safety anchors.

# Strategy selector

| Goal | Command | Key notes |
|------|---------|-----------|
| Append to known doc/block | `block.appendBlock` | Fast path. `--parentID`, `--data`. |
| Append to daily note | `block.appendDailyNoteBlock` | `--notebook` required. |
| Replace one known block | `tool update-block` | Preserves custom attrs. JSON array input. |
| Replace multiple known blocks | `tool update-block` | Same tool, multiple items in array. |
| Insert before/after a block | `block.insertBlock` | `--nextID` or `--previousID` + `--parentID`. |
| Prepend under parent | `block.prependBlock` | Creates new first child. |
| Broad document-level rewrite | `brute-edit --check` → `--dry-run` → `--yes` | Only if SAFE. Regenerates child ids. |
| Whole-document overwrite | `brute-edit --overwrite` | Same safety checks as brute-edit. |
| Create new document | `filetree.createDocWithMd` | `--notebook`, `--path`, `--markdown`. |
| Move a block | `block.moveBlock` | Omit `--previousID` = first child; end of parent = last child as anchor. |
| Move a document | `filetree.moveDocsByID` | hpath changes; id preserved. |
| Delete a document | `filetree.removeDocByID` | Prefer over deleting document block. |

Run `siyuan-cli api <command> --help` for parameters and INPUT SOURCES.

# Side effects

> ⚠️ **Raw `updateBlock` / `batchUpdateBlock` erases all `custom-*` attributes on the target block.** Always use `siyuan-cli tool update-block` instead — it preserves custom attributes automatically.

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

Fast path: `siyuan-cli api block.appendBlock --parentID <id> --data @stdin --yes` (example in SKILL §Hot paths). `dataType` defaults to `markdown`. Use `--dry-run` if parent id was just resolved. For multi-line content, prefer `@stdin` (heredoc / here-string) or `@file:` over inline `--data`; shell does not interpret `\n` as a newline inside quoted strings.

Daily notes are per-notebook: `block.appendDailyNoteBlock --notebook <id>`. If notebook id is unknown, run `notebook.lsNotebooks`; if multiple plausible notebooks, ask.

## Replace one or multiple blocks

```bash
siyuan-cli tool update-block --blocks @stdin --yes <<'EOF'
[{"id":"<block-id>","data":"Replacement content."}]
EOF
```

`--blocks` accepts literal, `@file:path`, or `@stdin`; array items are `{"id","data"}`; dataType is always markdown.

## Insert before or after

After a sibling: `block.insertBlock --parentID <parent-id> --previousID <sibling-id> --data @stdin --yes`; use `--nextID` to insert before. Full params: `block.insertBlock --help`.

## Create a document

```bash
siyuan-cli api filetree.createDocWithMd --notebook <notebook-id> --path "/path/to/doc" \
  --markdown @file:./content.md
```

## Broad document-level rewrite (brute-edit)

Use only when block-level edits are fragile/inefficient. Always check first.

```bash
# 1. Check safety
siyuan-cli tool brute-edit <doc-id> --check true --print json

# UNSAFE → use a block-level fallback; a checkpoint does not make brute-edit safe.

# SAFE → checkpoint once before this high-risk edit group, then preview and execute.
siyuan-cli tool checkpoint-doc <doc-id>
siyuan-cli tool brute-edit <doc-id> --replacements @file:./replacements.json --dry-run
siyuan-cli tool brute-edit <doc-id> --replacements @file:./replacements.json --yes
```

`replacements.json`: `[{"search":"old text","replace":"new text"}, ...]`
Each search must match exactly once. Overlapping or missing matches reject the operation.
Call `checkpoint-doc` explicitly once before a group of high-risk edits. Do not
repeat it before every edit in that group; `brute-edit` never creates one
automatically. On SiYuan >=3.7.0, the checkpoint includes kernel document
history and a local recovery package. Older kernels create the local package
and emit a warning.

## Whole-document overwrite

Same preflight as the replacements flow: `--check true` → if SAFE, `checkpoint-doc` once → then:

```bash
siyuan-cli tool get-block-content <doc-id> --range children --limit=-1 --bodyOnly true > ./doc.md
# ... edit ./doc.md locally ...
siyuan-cli tool brute-edit <doc-id> --overwrite @file:./doc.md --dry-run
siyuan-cli tool brute-edit <doc-id> --overwrite @file:./doc.md --yes
```

Write the round-trip file to a path you chose in this task, then remove it yourself. Do not rely on `$TMPDIR`: it is unset in many shells, including Windows MSYS, where `"$TMPDIR/doc.md"` becomes `/doc.md`.

Never overwrite from `--showId true` output; markers are not source text.

## Move a block

```bash
siyuan-cli api block.moveBlock --id <block-id> --parentID <parent-id>                                      # first child (omit anchor)
siyuan-cli api block.moveBlock --id <block-id> --previousID <sibling-id> --parentID <parent-id>  # after sibling; end of parent → <sibling-id> = last child (block.getTailChildBlocks)
```

Position semantics: `block.moveBlock --help`.

## Move a document

```bash
siyuan-cli api filetree.moveDocsByID --fromIDs '["<doc-id>"]' --toID <target-parent-id>
```

`--toID`: document id (move inside) or notebook id (move to root). Block ids preserved; hpath changes.

# Verification

SiYuan updates its search index asynchronously. Immediately after a write, index-sensitive reads (SQL, refs, export frontmatter) may still return the pre-write state. Wait 1–2s first:

```bash
sleep 1
siyuan-cli tool get-block-content <id> --range context --limit 7 --showId true
```

Confirm: intended target changed · neighbors unchanged · follow-up ids known · correct workspace/notebook.

# Recovery

**Wrong target**: re-run `current which` + `get-block-info` + bounded read; narrow to stable block id before retry.

**Denied / approval required**: inspect rules with `current which`; approve/reject in Approval Center or `siyuan-cli approval list`. Retry with `--yes` only when intended and allowed.

# Related docs

- `recipes/find-target.md` — resolve user hints to stable ids
- `recipes/read-content.md` — bounded reading with id awareness
- `siyuan-guide/siyuan-block.md` — block types, attributes, Markdown extensions
- `cli-usage/permission.md` — permission rules and debugging

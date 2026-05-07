---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
metadata:
  version: "{{VERSION}}"
---

# SiYuan CLI

Agent-first CLI for SiYuan Note. This SKILL is the entry protocol; detailed guidance lives in built-in docs (`siyuan doc list/read`).

## Bootstrap

1. If `siyuan` is missing: `npm install -g @frostime/siyuan-cli`.
2. If `<THIS_SKILL_FILE>.metadata.version != siyuan --version`: `siyuan skill install` for update + `siyuan skill read` read newer.
3. Discover CLI + docs:
   ```bash
   siyuan --help      # command tree + docs root
   siyuan doc list    # docs with real file paths
   ```
4. Confirm workspace before content work:
   ```bash
   siyuan workspace list
   siyuan workspace which
   ```
   If no workspace is configured, read `recipes/connect-workspace.md`.

Resolve doc paths against the docs root disclosed by `siyuan --help`.

## Mode gate

**Fast thinking**: read/list/search, or create/append with an explicit target. Use direct commands, bound output, verify only what is needed.

**Slow thinking**: editing existing content; delete/move/rename/reorder/overwrite; batch updates; ambiguous target/effect. Inspect first, choose strategy, write, read back.

Slow triggers:
- user asks to modify existing content
- target is title/keyword/hpath rather than stable id
- operation affects multiple blocks or a document block (`type='d'`)
- operation may regenerate ids (`brute-edit`, document-block update)
- destructive write or approval-gated operation

## Fast commands

Run `siyuan workspace which` before writes.

- notebooks: `siyuan api notebook.lsNotebooks`
- tree: `siyuan tool list-doc-tree --entry <notebook-or-doc-id> --depth 2`
- daily notes: `siyuan tool list-dailynote --atDate yyyy-MM-dd [--notebookId <id>]`
- resolve hpath/id: `siyuan tool resolve-path --hpath "/path"` / `--id <id>`
- block info: `siyuan tool get-block-info <id>`
- content: `siyuan tool get-block-content <id> [--showId true] [--slice "0:30"]`
- exact block source: `siyuan api block.getBlockKramdown --id <id>`
- keyword search: `siyuan api search.fullTextSearchBlock "keyword"`
- create doc: `siyuan api filetree.createDocWithMd --notebook <id> --path "/path/doc" --markdown @stdin`
- import md: `siyuan tool push-md ./note.md --notebook <id> --toPath /parent`
- append: `siyuan tool append-content --targetId <id> --targetType document --markdown @stdin`

## Safe write protocol

1. `siyuan workspace which`
2. Stabilize target: workspace, notebook id, document id, block id; use `recipes/find-target.md` when unclear.
3. Inspect:
   ```bash
   siyuan tool get-block-info <id>
   siyuan tool get-block-content <id> --showId true
   ```
4. Choose write path:
   - append only → `siyuan tool append-content ... --markdown @stdin`
   - one block → `siyuan api block.updateBlock --id <id> --dataType markdown --data @stdin`
   - multiple blocks → `siyuan api block.batchUpdateBlock --blocks @file:./blocks.json`
   - insert before/after → `siyuan api block.insertBlock --parentID <parent> --nextID <id>` or `--previousID <id>`
   - whole-doc search/replace → `siyuan tool brute-edit <doc-id> --replacements @stdin --dry-run` (JSON via stdin avoids shell escaping of long replacement lists)
   - move block → `siyuan api block.moveBlock --id <id> --previousID <sibling-id> --parentID <parent-id>`
   - move document → `siyuan api filetree.moveDocsByID --fromIDs '["<id>"]' --toID <target-parent-id>`
   - delete document → `siyuan api filetree.removeDocByID --id <doc-id>`
5. Use `--dry-run` when supported; use `--yes` only when intended and allowed.
6. Verify with `get-block-content ... --showId true`.

Rules:
- `dataType: "markdown"` by default; use `dom` only for DOM-level edits.
- Updating a document block replaces its child tree; treat as high risk.
- `brute-edit` regenerates child block ids; use only when child refs/attributes are not important.
- Prefer `removeDocByID` over `block.deleteBlock` for deleting documents.

## Long input pattern

Use `@stdin` or `@file:` for markdown, SQL, JSON, and templates.

```bash
# pipe replacement JSON → avoids shell escaping for large replacement lists
cat replacements.json | siyuan tool brute-edit <doc-id> --replacements @stdin --dry-run

# heredoc for block content
siyuan api block.updateBlock --id <id> --dataType markdown --data @stdin <<'EOF'
Replacement markdown
EOF
```

`@stdin` is single-use per invocation. Use `@file:` when multiple fields need long input.

## Docs routing

When shortcuts are insufficient, run `siyuan doc list`, then read the relevant doc:

- find/read/edit: `recipes/find-target.md`, `recipes/read-content.md`, `recipes/edit-content.md`
- block/path/sql/daily model: `siyuan-guide/siyuan-block.md`, `document-tree-and-paths.md`, `sql-query-guide.md`, `dailynote-model.md`
- CLI/config/permission/extension: `cli-usage/cli-overview.md`, `workspace-config.md`, `permission.md`, `extension.md`

## Domain rules

- Block is the primary entity; document = container block (`type='d'`).
- `id` is stable. Prefer it for writes. `hpath` is human-readable and rename-sensitive.
- `parent_id` = block hierarchy; `root_id` = owning document; `box` = notebook id.
- Non-document `path`/`hpath` describe the containing document.
- `content` = plain text for search; `markdown`/Kramdown = source representation.
- SQL is read-only for agents: always `LIMIT`, narrow with `box`, `root_id`, `type` before fuzzy `LIKE`.
- Block ref syntax: `((<BlockId> "anchor"))`. Custom attributes use `custom-` prefix.

## Gotchas

- Windows Git Bash / MSYS may rewrite leading `/` virtual paths. Use `MSYS_NO_PATHCONV=1 ...` or `//path` when needed.
- stdout is result data; stderr carries JSON errors/warnings.
- Exit codes: 0 OK, 1 general, 2 config, 3 network, 4 auth, 5 permission.
- Permission/approval behavior is workspace/project config dependent. Inspect with `siyuan workspace which`.

## Internals

This SKILL covers CLI usage, not task-specific workflows. Create separate skills on top of it for literature ingestion, daily review, project KB maintenance, etc.

For internals or extension typing, read `siyuan doc read cli-usage/extension`, then inspect sibling `dist/` in the installed package (especially `dist/shared/schema.d.mts`).

GitHub: [siyuan-cli](https://github.com/frostime/siyuan-cli) · [SiYuan kernel API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)

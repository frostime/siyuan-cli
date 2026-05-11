---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
metadata:
  version: "{{VERSION}}"
---

# SiYuan CLI

Agent-first CLI for SiYuan Note. This SKILL is the operational router; detailed scenario guidance lives in built-in docs (`siyuan doc list/read`).

## Bootstrap

1. If `siyuan` is missing: `npm install -g @frostime/siyuan-cli`.
2. If `<THIS_SKILL_FILE>.metadata.version != siyuan --version`: `siyuan skill install` for update, then `siyuan skill read` to refresh.
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
   If no workspace is configured, read `recipes/connect-workspace.md`. If base URL/token/workspace are unknown, stop and ask the user.

Doc paths referenced below are not relative to this SKILL file. Read docs through `siyuan doc list` / `siyuan doc read <path>`, or use the docs root printed by `siyuan --help`. Do not try to resolve recipe/doc paths under the SKILL directory.

## First response rules

- For user SiYuan content tasks, use the installed `siyuan` CLI first. Do not inspect this repository or implementation code unless the user asks to develop/debug `siyuan-cli` itself.
- For risky writes (edit existing content, delete, move, overwrite, batch update), read `recipes/find-target.md` and `recipes/edit-content.md` unless the target is already a stable id and the operation is append-only.
- For a user-named document such as “project plan” or “yesterday's daily note”, resolve the target first: workspace → notebook/scope → candidate docs → stable id → read/write.

## Layer routing

| Task shape | Prefer | Why |
|------------|--------|-----|
| Manage/read/edit SiYuan notes | CLI commands + recipes | normal content operation path |
| One kernel call with a known endpoint | registered `api` | schema, permission, approval, response filtering, help |
| Multi-step reusable operation | `tool` | composes calls and shapes output |
| One-off missing kernel API | `api raw` | exploratory escape hatch for unregistered endpoints |
| Repeated missing API | API extension | adds schema, guards, help, and formatting |
| Repeated multi-call workflow | tool extension | reusable CLI runtime orchestration |
| Repeated domain workflow with defaults/templates | downstream Agent SKILL | keeps user policy out of the CLI substrate |
| Debug or modify `siyuan-cli` itself | internals docs, then source/dist | development task, not normal note operation |

## Mode gate

**Fast path**: read/list/search, or create/append with an explicit stable target. Use direct commands, bound output, and verify only what is needed.

**Slow path**: editing existing content; delete/move/rename/reorder/overwrite; batch updates; ambiguous target/effect. Inspect first, choose strategy, write, read back.

Slow triggers:
- user asks to modify existing content
- target is title/keyword/hpath rather than stable id
- operation affects multiple blocks or a document block (`type='d'`)
- operation may regenerate ids (`brute-edit`, document-block update)
- destructive write or approval-gated operation

## Task start points

Use these as dispatch, not as a complete command reference.

| User wants to... | Start with |
|------------------|------------|
| connect or debug workspace | `siyuan doc read recipes/connect-workspace.md` |
| locate a user-mentioned doc/block | `siyuan doc read recipes/find-target.md` |
| read located content | `siyuan doc read recipes/read-content.md` |
| edit/append/move/delete content | `siyuan doc read recipes/edit-content.md` |
| understand block/path/sql/daily model | `siyuan doc read siyuan-guide/siyuan-block.md` then related guide |
| configure permissions/approval/filtering | `siyuan doc read cli-usage/permission.md` |
| extend runtime capability | `siyuan doc read cli-usage/extension.md` |

## Common commands

```bash
# workspace and discovery
siyuan workspace which
siyuan api notebook.lsNotebooks
siyuan tool list-doc-tree --entry <notebook-or-doc-id> --depth 2

# locate/read
siyuan tool resolve-path --hpath "/path"
siyuan api filetree.searchDocs --k "title-or-keyword"
siyuan api search.fullTextSearchBlock "keyword"
siyuan tool get-block-info <id>
siyuan tool get-block-content <id> --showId true
siyuan api block.getBlockKramdowns --ids '["<id1>","<id2>"]'

# write/create
siyuan tool append-content --targetId <id> --targetType document --markdown @stdin
siyuan api block.updateBlock --id <id> --dataType markdown --data @stdin
siyuan api block.batchUpdateBlock --blocks @file:./blocks.json
siyuan api filetree.createDocWithMd --notebook <id> --path "/path/doc" --markdown @stdin
```

## Safe write protocol

1. `siyuan workspace which`
2. Stabilize target: workspace, notebook id, document id, block id. Use `recipes/find-target.md` when unclear.
3. Inspect:
   ```bash
   siyuan tool get-block-info <id>
   siyuan tool get-block-content <id> --showId true
   ```
4. Choose the least destructive write path from `recipes/edit-content.md`.
5. Use `--dry-run` when supported; use `--yes` only when intended and allowed.
6. Verify with `get-block-content ... --showId true`.

Rules:
- Prefer append over replace when the user's goal allows it.
- Prefer batch endpoints over per-id loops when handling multiple known block/doc IDs.
- `dataType: "markdown"` by default; use `dom` only for DOM-level edits.
- Updating a document block replaces its child tree; treat as high risk.
- `brute-edit` regenerates child block ids; use only when child refs/attributes are not important.
- Prefer `removeDocByID` over `block.deleteBlock` for deleting documents.

## Long input pattern

Use `@stdin` or `@file:` for markdown, SQL, JSON, and templates.

```bash
cat replacements.json | siyuan tool brute-edit <doc-id> --replacements @stdin --dry-run

siyuan api block.updateBlock --id <id> --dataType markdown --data @stdin <<'EOF'
Replacement markdown
EOF
```

`@stdin` is single-use per invocation. Use `@file:` when multiple fields need long input.

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
- stdout is result data; stderr carries JSON errors/warnings. In `--print json` mode, approval-pending and auto-open diagnostics stay on stderr so stdout remains a single JSON envelope.
- `CONTENT_FILTERED` means the result is valid but incomplete under current permission rules; tell the user it is a partial view and do not infer missing items/siblings/attrs do not exist.
- Endpoint choice: registered built-in/API extension > `api raw` for one-off missing kernel APIs > create an extension for repeated use or guard/format needs. Avoid long-lived `rawApi.allow: ["*"]`.
- Exit codes: 0 OK, 1 general, 2 config, 3 network, 4 auth, 5 permission.
- Permission/approval behavior is workspace/project config dependent. Inspect with `siyuan workspace which`.

## Internals

For internals or extension typing, read `siyuan doc read cli-usage/extension`, then inspect sibling `dist/` in the installed package (especially `dist/shared/schema.d.mts`).

GitHub: [siyuan-cli](https://github.com/frostime/siyuan-cli) · [SiYuan kernel API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)

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
2. Run `siyuan --help`, if `<THIS_SKILL_FILE>.metadata.version != siyuan cli version`: `siyuan skill install` for update, then `siyuan skill read` to refresh.
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

## Doc path resolution

Doc paths referenced in this SKILL (e.g. `recipes/find-target.md`) are not relative to this SKILL file. Access them through:
- `siyuan doc read <path>` (e.g. `siyuan doc read recipes/find-target.md`)
- `siyuan doc list` to see all docs with real file paths
- the docs root printed by `siyuan --help`

Do not try to resolve doc paths under the SKILL directory.

WARN: If AGENT is working on VFS like WSL, Msys etc, paths may not resolve as expected.

## First response rules

- **Content tasks**: use the installed `siyuan` CLI. Do not inspect this repository's source code unless the user asks to modify siyuan-cli internals. For extension authoring, read `cli-usage/extension.md`.
- **User-named targets** (title, keyword, hpath, date phrase — anything that is not already a stable id): read `recipes/find-target.md` first to resolve to a stable id.
- **Writes beyond append-only** (edit, delete, move, overwrite, batch update): also read `recipes/edit-content.md`.
- A user-named document like "project plan" or "yesterday's daily note" always goes through: workspace → notebook/scope → candidate docs → stable id → read/write.

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
| append to or query daily notes | `siyuan doc read siyuan-guide/dailynote-model.md` |
| understand block/path/sql model | `siyuan doc read siyuan-guide/siyuan-block.md` then related guide |
| configure permissions/approval/filtering | `siyuan doc read cli-usage/permission.md` |
| extend runtime capability | `siyuan doc read cli-usage/extension.md` |

## Common commands (bootstrap & discovery only)

```bash
# workspace
siyuan workspace which
siyuan workspace list
siyuan workspace verify

# discovery
siyuan api list
siyuan api <id> --help
siyuan tool list
siyuan tool <id> --help
siyuan api notebook.lsNotebooks
siyuan tool list-doc-tree --entry <notebook-or-doc-id> --depth 2
```

For locate/read/write commands, follow the recipes in "Task start points" above.

## Safe write protocol

Before any write: confirm workspace, stabilize target to a stable id, inspect with `get-block-info` and a bounded `get-block-content` read (usually `--range context --limit 7 --showId true`), then follow the strategy selector in `recipes/edit-content.md`.

Rules:
- Prefer append over replace when the user's goal allows it (`block.appendBlock` for known parent ids, `block.appendDailyNoteBlock` for daily notes).
- Prefer batch endpoints over per-id loops when handling multiple known block/doc IDs.
- `dataType: "markdown"` by default; use `dom` only for DOM-level edits.
- Updating a document block replaces its child tree; treat as high risk. Create `checkpoint-doc <doc-id>` first when recovery matters.
- For document-level text replacement, run `brute-edit <doc-id> --check true` first, then `--dry-run`, then `--yes` only if the plan is intended. If rejected, fall back to block-level `updateBlock`.
- `brute-edit` regenerates child block ids. Do not use `get-block-content --showId true` marker lines (`@@id@@type`) as brute-edit search text.
- Use `--dry-run` when supported; note that `brute-edit --dry-run` performs substantive local checks, while most API dry-runs only preview payload/approval.
- If temporary files are needed for `@file:` or `cat ... | @stdin`, prefer the system temp directory (`$TMPDIR`/`/tmp`/`%TEMP%`, or `mktemp -d`) over the current project directory, and delete those files after the command completes.

## Domain rules

### Data model

- Block is the primary entity; document = container block (`type='d'`).
- `content` = plain text (search/match); `markdown`/Kramdown = source (edit/export).
- Block ref syntax: `((<BlockId> "anchor"))`. Custom attributes use `custom-` prefix.

### Addressing

- `id` is stable. Prefer it for all programmatic use. `hpath` is human-readable, rename-sensitive — display only.
- Stable addressing priority: `id` > `root_id` > `path`. Never use `hpath` or title as a stable key.
- For user-facing output: show `hpath` + title/content + block link when needed.

### Hierarchy & scope

- `parent_id` = direct block parent-child. Use for tree traversal. Do **not** infer hierarchy from `path`.
- `root_id` = owning document. Use for document-scope filtering.
- `box` = notebook id. Use for notebook-scope filtering.
- Non-document blocks' `path`/`hpath` describe the **containing document**, not the block itself.

### Query discipline

- Narrow scope first: constrain with `root_id`/`box`/`type` before fuzzy `LIKE`.
- Field selection: `content` for search, `markdown` for edit, `parent_id` for tree, `root_id` for doc scope.
- Always specify `LIMIT`. Prefer batch endpoints over per-id loops for multiple known IDs.

## Gotchas

- Windows Git Bash / MSYS may rewrite leading `/` virtual paths. Use `MSYS_NO_PATHCONV=1 ...` or `//path` when needed.
- stdout is result data; stderr carries JSON errors/warnings. In `--print json` mode, approval-pending and auto-open diagnostics stay on stderr so stdout remains a single JSON envelope.
- `CONTENT_FILTERED` means the result is valid but incomplete under current permission rules; tell the user it is a partial view and do not infer missing items/siblings/attrs do not exist.
- Endpoint choice: registered built-in/API extension > `api raw` for one-off missing kernel APIs > create an extension for repeated use or guard/format needs. Avoid long-lived `rawApi.allow: ["*"]`.
- Exit codes: 0 OK, 1 general, 2 config, 3 network, 4 auth, 5 permission.
- Permission/approval behavior is workspace/project config dependent. Inspect with `siyuan workspace which`.
- For long text input (markdown, SQL, JSON), use `@stdin`, `@file:`, or shell heredoc. See `cli-usage/cli-overview.md` §Input sources or `<endpoint> --help`.

## Internals

For internals or extension typing, read `siyuan doc read cli-usage/extension`, then inspect sibling `dist/` in the installed package (especially `dist/shared/schema.d.mts`).

GitHub: [siyuan-cli](https://github.com/frostime/siyuan-cli) · [SiYuan kernel API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)

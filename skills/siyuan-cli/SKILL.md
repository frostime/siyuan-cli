---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan-cli` CLI. Use this whenever the user mentions SiYuan, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
metadata:
  version: "{{VERSION}}"
---

# SiYuan CLI

Agent-first CLI for SiYuan Note. This SKILL is the entry point; the bundled resources listed under Routing hold task playbooks and reference detail.

## Shipped skill, matching version

`siyuan-cli skill read` always serves the skill bundled with the running CLI. An installed copy can lag behind it: the skill version is on every `skill read` envelope, `siyuan-cli --help` prints the CLI version and warns when an installed copy differs. On a mismatch, run `siyuan-cli skill install`, then re-read before trusting any detail.

## Bootstrap

```bash
siyuan-cli --help
siyuan-cli current which
```

If `siyuan-cli` is missing: `npm install -g @frostime/siyuan-cli`. Always invoke this package as `siyuan-cli`; on SiYuan 3.7.0 or later, `siyuan` may resolve to SiYuan's native CLI instead. If no workspace is configured, read `recipes/connect-workspace.md`. When adding a connection, stop and ask if the target SiYuan workspace is ambiguous, no token source is available, or neither its base URL nor local directory is known; choose a local CLI alias only after the target itself is clear.

## Workspace selection

Before content work, run `siyuan-cli current which` to inspect persistent/ambient selection. For a one-off call with explicit `--workspace <name>`, that flag determines the target even if `current which` shows a different ambient workspace; keep the flag on the business command. For writes, ask if only machine-wide `config.current` is selected and the user has not named that target.

Choose the narrowest scope: one or a few calls → `--workspace <name>`; repeated project work → `.siyuan-cli.yaml`; long-lived work without a project → experimental process binding; deliberate machine-wide default change → `current global <name>` (not isolation).

Before process binding, read `cli-usage/current.md`. Run bind and confirm as separate tool/CLI calls from the same long-lived caller, not one disposable shell block. Cancel an abandoned nonce with the exact command bind printed; unbind after confirmation. If project and binding disagree, use a one-call `--workspace` exception or fix the conflict.

## Command discovery

Docs = decision map. `--help` = parameter syntax.

```bash
siyuan-cli api <id> --help       # params, INPUT SOURCES, examples
siyuan-cli tool <id> --help      # params, examples, behavior
siyuan-cli api list              # endpoints + classification/severity labels
siyuan-cli tool list             # tools
```

Before using `@file:`/`@stdin`/`@env:` on a parameter, check `--help` → `INPUT SOURCES`. If absent, use literal or whole-payload `-j`/`-f`.

## Safety anchors

| # | Rule |
|---|------|
| 1 | Confirm workspace before content work; never silently switch for writes. |
| 2 | Write only to stable id / resolved root_id; never title/keyword/hpath alone. |
| 3 | Non-append writes require `get-block-info` + bounded `get-block-content --showId true`. |
| 4 | Smallest safe surface: append → block update → batch update → guarded brute-edit. |
| 5 | `CONTENT_FILTERED` / truncation = valid but incomplete; don't infer absence. |
| 6 | `--yes` is not a safety check; use only after target verified + action intended. |
| 7 | `api raw` bypasses schema/resource guards/response filtering; one-off only. |
| 8 | Approval browser auto-open may be debounced; parse every `APPROVAL_PENDING` stderr event, not browser opens. |

```text
Small localized edit with known block ids
  → tool update-block (preserves custom attrs)

Broad/complex/text-level edit
  → brute-edit <doc-id> --check true
    SAFE   → checkpoint-doc once → --dry-run → inspect → --yes
    UNSAFE → block-level fallback

Before a group of high-risk edits, call checkpoint-doc explicitly once. Do not
repeat it for later edits in the same group; brute-edit never creates a
checkpoint automatically. A checkpoint is recovery material, not permission
to bypass an unsafe check.
```

Ask user when: no token/URL · wrong workspace · multiple plausible write targets · destructive operation lacks confirmation · daily-note notebook unknown.

## Mode gate

- **Fast path**: read/list/search, or create/append with explicit stable target.
- **Slow path**: edit existing content; target is title/keyword/hpath; affects multiple blocks/document block; may regenerate ids; destructive/approval-gated.

## Canonical input patterns

Check `--help` INPUT SOURCES first.

```bash
# heredoc (bash) / here-string (PowerShell @'...'@): parameter supports stdin
siyuan-cli api block.appendBlock --parentID <id> --data @stdin --yes <<'EOF'
Content here.
EOF

# @file: parameter supports file
siyuan-cli tool update-block --blocks @file:./updates.json --yes

# pipe: parameter supports stdin
cat query.sql | siyuan-cli api query.sql --stmt @stdin

# whole payload: all commands support -j / -f
siyuan-cli api attr.setBlockAttrs -j '{"id":"<id>","attrs":{"custom-key":"value"}}'
siyuan-cli api attr.batchSetBlockAttrs -f ./attrs.json --yes
```

## Hot paths

### Append

Use `block.appendBlock` with §Canonical input patterns. Daily note example:

```bash
# Notebook id must be known; if unknown, list notebooks or ask.
siyuan-cli api block.appendDailyNoteBlock --notebook <notebook-id> --data @stdin --yes <<'EOF'
Entry.
EOF
```

### Search/read

```bash
siyuan-cli api filetree.searchDocs --k "<keyword>"    # candidates; verify before writing
siyuan-cli tool get-block-info <id>                   # identity, meta data (ref, toc, child etc.)
siyuan-cli tool search-backlinks <target-id>          # inbound refs; redirects first-block hits by default
siyuan-cli tool get-block-content <id> --range children --limit 50
siyuan-cli tool get-block-content <id> --range context --limit 7 --showId true
siyuan-cli tool locate-block --id <doc-id> --pattern "%keyword%"  # SQL LIKE, not regex
```

### Update known block

Fast command, slow pre-flight. Required: workspace confirmed; stable block id; current content inspected; user intent maps exactly to block. Else read `recipes/edit-content.md`.

```bash
siyuan-cli tool update-block --blocks @stdin --yes <<'EOF'
[{"id":"<block-id>","data":"Replacement."}]
EOF
```

> ⚠️ Do NOT use raw `block.updateBlock` / `block.batchUpdateBlock` — they erase custom attributes. Always use `tool update-block`.

## Error triage

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | success | parse stdout |
| 1 | general/kernel/approval/not found | read stderr JSON |
| 2 | config/workspace | `siyuan-cli current which` |
| 3 | network/kernel down | ask user to start SiYuan |
| 4 | auth/token | ask user for token |
| 5 | permission denied | `siyuan-cli current which` |

stderr = diagnostics; stdout = result.

## Routing

Read a resource with `siyuan-cli skill read <path>`. Paths are relative to this skill; a bare `siyuan-cli skill read` also prints them as a manifest.

| Need | Read |
|------|------|
| workspace selection/binding | `cli-usage/current.md` |
| workspace connect/debug | `recipes/connect-workspace.md` |
| config schema (behavior, rawApi, defaults, project-file) | `cli-usage/workspace-config.md` |
| locate user-named doc/block | `recipes/find-target.md` |
| read content ranges/paging/ids | `recipes/read-content.md` |
| reference/backlink navigation | `recipes/read-content.md` + `siyuan-guide/sql-query-guide.md` |
| edit/move/delete/batch/create | `recipes/edit-content.md` |
| daily notes | `siyuan-guide/dailynote-model.md` |
| block/path/sql model | `siyuan-guide/siyuan-block.md` |
| permissions/approval config | `cli-usage/permission.md` |
| custom API/tool extension | `cli-usage/extension.md` |
| deep CLI mechanics: flags, input-source edge cases, stdout/stderr, Approval Center, MSYS | `cli-usage/cli-overview.md` |

## Layer choice

| Shape | Prefer |
|-------|--------|
| normal note work | CLI + recipes |
| one known endpoint | registered `api` |
| multi-step operation | `tool` |
| one-off missing endpoint | `api raw` |
| repeated missing endpoint | API extension |
| repeated multi-call workflow | tool extension |
| user policy/defaults/templates | downstream Agent SKILL |

## First response rules

- Content tasks: use installed `siyuan-cli`; do not inspect repo source unless modifying siyuan-cli internals.
- User-named targets: `recipes/find-target.md` first.
- Writes beyond append-only: also `recipes/edit-content.md`.

## Domain rules

- Block is primary; document = container block (`type='d'`).
- Stable addressing: **id > root_id > path**; never hpath/title as stable key.
- `parent_id` = hierarchy; `root_id` = owning doc; `box` = notebook.
- Non-document block `path`/`hpath` describes containing document.
- SQL: always `LIMIT`; narrow with `root_id`/`box`/`type` before fuzzy `LIKE`.

## Gotchas

- Windows Git Bash/MSYS rewrites leading `/` paths → `MSYS_NO_PATHCONV=1 ...` or `//path`.
- `--showId true` injects `@@id@@type` markers; never use them as brute-edit source/search text.
- Endpoint choice: registered > `api raw`; avoid long-lived `rawApi.allow: ["*"]`.

## Internals

For extension typing: read `cli-usage/extension.md`, then inspect installed `dist/shared/schema.d.mts`.

GitHub: [siyuan-cli](https://github.com/frostime/siyuan-cli) · [SiYuan kernel API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)

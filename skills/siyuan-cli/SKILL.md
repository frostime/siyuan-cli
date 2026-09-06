---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan-cli` CLI. Use this whenever the user mentions SiYuan, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
metadata:
  version: "{{VERSION}}"
---

# SiYuan CLI

Agent-first CLI for SiYuan Note. This SKILL is the entry point; bundled resources provide task playbooks (`siyuan-cli skill read <path>`).

## Version gate

Compare the skill version with the CLI version you are running (both appear in CLI output; the CLI also warns explicitly on mismatch). If they differ, run `siyuan-cli skill install` and `siyuan-cli skill read` again. Do not trust any routed detail until versions match.

## Bootstrap

```bash
siyuan-cli --help
siyuan-cli current which
```

If `siyuan-cli` is missing: `npm install -g @frostime/siyuan-cli`. Always invoke this package as `siyuan-cli`; on SiYuan 3.7.0 or later, `siyuan` may resolve to SiYuan's native CLI instead. If no workspace is configured: `siyuan-cli skill read recipes/connect-workspace.md`. If URL/token/workspace are unknown: stop and ask user.

## Workspace selection

Before content work, run `siyuan-cli current which` and confirm the resolved workspace matches the user's intent. For writes, ask if only machine-wide `config.current` is selected and the user has not named that target.

Choose the narrowest scope: one or a few calls → `--workspace <name>`; repeated work in a project → `.siyuan-cli.yaml` with `workspace: <name>`; long-lived work without a project → `current bind <name>` then an independent `current confirm <nonce>`; deliberately changing the shared default → `current global <name>` (not isolation). If project and binding disagree, stop and use a one-call `--workspace` exception or fix the conflict. After using `bind`, always run `siyuan-cli current unbind` manually before ending the task. Details: `siyuan-cli skill read cli-usage/current.md`.

## Command discovery

Docs = decision map. `--help` = parameter syntax.

```bash
siyuan-cli api <id> --help       # params, INPUT SOURCES, examples
siyuan-cli tool <id> --help      # params, examples, behavior
siyuan-cli api list              # endpoints + classification/severity labels
siyuan-cli tool list             # tools
siyuan-cli skill list             # skill + resources + summaries
```

Before using `@file:`/`@stdin`/`@env:` on a parameter, check `--help` → `INPUT SOURCES`. If absent, use literal or whole-payload `-j`/`-f`. Skill resources are read via `siyuan-cli skill read <path>`.

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

| Need | Read / do |
|------|-----------|
| workspace selection/binding | `siyuan-cli skill read cli-usage/current.md` |
| workspace connect/debug | `siyuan-cli skill read recipes/connect-workspace.md` |
| config schema (behavior, rawApi, defaults, project-file) | `siyuan-cli skill read cli-usage/workspace-config.md` |
| locate user-named doc/block | `siyuan-cli skill read recipes/find-target.md` |
| read content ranges/paging/ids | `siyuan-cli skill read recipes/read-content.md` |
| reference/backlink navigation | `siyuan-cli skill read recipes/read-content.md` + `siyuan-cli skill read siyuan-guide/sql-query-guide.md` |
| edit/move/delete/batch/create | `siyuan-cli skill read recipes/edit-content.md` |
| daily notes | `siyuan-cli skill read siyuan-guide/dailynote-model.md` |
| block/path/sql model | `siyuan-cli skill read siyuan-guide/siyuan-block.md` |
| permissions/approval config | `siyuan-cli skill read cli-usage/permission.md` |
| custom API/tool extension | `siyuan-cli skill read cli-usage/extension.md` |
| deep CLI mechanics: flags, input-source edge cases, stdout/stderr, Approval Center, MSYS | `siyuan-cli skill read cli-usage/cli-overview.md` |

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

For extension typing: `siyuan-cli skill read cli-usage/extension.md`, then inspect installed `dist/shared/schema.d.mts`.

GitHub: [siyuan-cli](https://github.com/frostime/siyuan-cli) · [SiYuan kernel API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)

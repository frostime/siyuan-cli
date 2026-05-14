---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
metadata:
  version: "{{VERSION}}"
---

# SiYuan CLI

Agent-first CLI for SiYuan Note. This SKILL is the entry point; built-in docs provide task playbooks (`siyuan doc list/read`).

## Bootstrap

```bash
siyuan --help
siyuan workspace which
```

If `siyuan` is missing: `npm install -g @frostime/siyuan-cli`. If skill version differs from CLI version: `siyuan skill install`, then `siyuan skill read`. If no workspace is configured: `siyuan doc read recipes/connect-workspace.md`. If URL/token/workspace are unknown: stop and ask user.

## Command discovery

Docs = decision map. `--help` = parameter syntax.

```bash
siyuan api <id> --help       # params, INPUT SOURCES, examples
siyuan tool <id> --help      # params, examples, behavior
siyuan api list              # endpoints + classification/severity labels
siyuan tool list             # tools
siyuan doc list              # docs + real paths
```

Before using `@file:`/`@stdin`/`@env:` on a parameter, check `--help` → `INPUT SOURCES`. If absent, use literal or whole-payload `-j`/`-f`. Doc paths here are read via `siyuan doc read <path>`.

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
    SAFE   → --dry-run → inspect → --yes
    UNSAFE → checkpoint-doc → block-level fallback

checkpoint-doc = recovery material, not permission to bypass unsafe check.
```

Ask user when: no token/URL · wrong workspace · multiple plausible write targets · destructive operation lacks confirmation · daily-note notebook unknown.

## Mode gate

- **Fast path**: read/list/search, or create/append with explicit stable target.
- **Slow path**: edit existing content; target is title/keyword/hpath; affects multiple blocks/document block; may regenerate ids; destructive/approval-gated.

## Canonical input patterns

Check `--help` INPUT SOURCES first.

```bash
# heredoc (bash) / here-string (PowerShell @'...'@): parameter supports stdin
siyuan api block.appendBlock --parentID <id> --data @stdin --yes <<'EOF'
Content here.
EOF

# @file: parameter supports file
siyuan tool update-block --blocks @file:./updates.json --yes

# pipe: parameter supports stdin
cat query.sql | siyuan api query.sql --stmt @stdin

# whole payload: all commands support -j / -f
siyuan api attr.setBlockAttrs -j '{"id":"<id>","attrs":{"custom-key":"value"}}'
siyuan api attr.batchSetBlockAttrs -f ./attrs.json --yes
```

## Hot paths

### Append

Use `block.appendBlock` with §Canonical input patterns. Daily note example:

```bash
# Notebook id must be known; if unknown, list notebooks or ask.
siyuan api block.appendDailyNoteBlock --notebook <notebook-id> --data @stdin --yes <<'EOF'
Entry.
EOF
```

### Search/read

```bash
siyuan api filetree.searchDocs --k "<keyword>"    # candidates; verify before writing
siyuan tool get-block-info <id>                   # identity
siyuan tool get-block-content <id> --range children --limit 50
siyuan tool get-block-content <id> --range context --limit 7 --showId true
siyuan tool locate-block --id <doc-id> --pattern "%keyword%"  # SQL LIKE, not regex
```

### Update known block

Fast command, slow pre-flight. Required: workspace confirmed; stable block id; current content inspected; user intent maps exactly to block. Else read `recipes/edit-content.md`.

```bash
siyuan tool update-block --blocks @stdin --yes <<'EOF'
[{"id":"<block-id>","data":"Replacement."}]
EOF
```

> ⚠️ Do NOT use raw `block.updateBlock` / `block.batchUpdateBlock` — they erase custom attributes. Always use `tool update-block`.

## Error triage

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | success | parse stdout |
| 1 | general/kernel/approval/not found | read stderr JSON |
| 2 | config/workspace | `siyuan workspace which` |
| 3 | network/kernel down | ask user to start SiYuan |
| 4 | auth/token | ask user for token |
| 5 | permission denied | `siyuan workspace which` |

stderr = diagnostics; stdout = result.

## Routing

| Need | Read / do |
|------|-----------|
| workspace connect/debug | `siyuan doc read recipes/connect-workspace.md` |
| config schema (behavior, rawApi, defaults, project-file) | `siyuan doc read cli-usage/workspace-config.md` |
| locate user-named doc/block | `siyuan doc read recipes/find-target.md` |
| read content ranges/paging/ids | `siyuan doc read recipes/read-content.md` |
| edit/move/delete/batch/create | `siyuan doc read recipes/edit-content.md` |
| daily notes | `siyuan doc read siyuan-guide/dailynote-model.md` |
| block/path/sql model | `siyuan doc read siyuan-guide/siyuan-block.md` |
| permissions/approval config | `siyuan doc read cli-usage/permission.md` |
| custom API/tool extension | `siyuan doc read cli-usage/extension.md` |
| deep CLI mechanics: flags, input-source edge cases, stdout/stderr, Approval Center, MSYS | `siyuan doc read cli-usage/cli-overview.md` |

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

- Content tasks: use installed `siyuan`; do not inspect repo source unless modifying siyuan-cli internals.
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

For extension typing: `siyuan doc read cli-usage/extension.md`, then inspect installed `dist/shared/schema.d.mts`.

GitHub: [siyuan-cli](https://github.com/frostime/siyuan-cli) · [SiYuan kernel API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)

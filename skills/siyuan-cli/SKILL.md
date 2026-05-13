---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
metadata:
  version: "{{VERSION}}"
---

# SiYuan CLI

Agent-first CLI for SiYuan Note. This SKILL is the operational entry point; detailed scenario guidance lives in built-in docs (`siyuan doc list/read`).

## Bootstrap

1. If `siyuan` is missing: `npm install -g @frostime/siyuan-cli`.
2. Run `siyuan --help`. If `<THIS_SKILL_FILE>.metadata.version != siyuan cli version`: `siyuan skill install` to update, then `siyuan skill read` to refresh.
3. Confirm workspace before content work:
   ```bash
   siyuan workspace which
   ```
   If no workspace configured → `siyuan doc read recipes/connect-workspace.md`. If base URL/token unknown → stop and ask user.

## Command discovery

Docs provide decision logic and safety rules. `--help` provides parameter syntax.

```bash
siyuan api <id> --help       # params, INPUT SOURCES, examples
siyuan tool <id> --help      # params, examples, behavior
siyuan api list              # all endpoints with risk labels
siyuan tool list             # all tools
siyuan doc list              # built-in docs with real file paths
```

Check `INPUT SOURCES` in `--help` before using `@file:`/`@stdin`/`@env:` on a parameter. Parameters without input source declaration accept only literal values or whole-payload mode (`-j`/`-f`).

Doc paths in this SKILL (e.g. `recipes/find-target.md`) → access via `siyuan doc read <path>`.

## Safety anchors

7 non-negotiable rules. Violating any one can cause data loss or silent corruption.

| # | Anchor | Rule |
|---|---|---|
| 1 | Workspace identity | Confirm workspace before content work. Never silently switch for writes. |
| 2 | Stable target | Write only to stable id / resolved root_id. Never write to title/keyword/hpath. |
| 3 | Inspect before modify | Non-append writes: `get-block-info` + bounded `get-block-content --showId true`. |
| 4 | Smallest Safe Edit Surface | append → block update → batch update → brute-edit (guarded escalation). |
| 5 | Partial visibility | `CONTENT_FILTERED` / truncation = valid but incomplete. Don't infer absence. |
| 6 | Approval discipline | `--yes` is not a safety check. Use only after target verified + action intended. |
| 7 | Raw API boundary | `api raw` bypasses schema, resource-scoped permission, response filtering. One-off only. |

**Smallest Safe Edit Surface decision tree:**

```text
Known block ids, small localized edit
  → block.updateBlock / block.batchUpdateBlock

Broad/complex/text-level edit, block-level fragile or inefficient
  → brute-edit <doc-id> --check true
    SAFE   → --dry-run → inspect → --yes
    UNSAFE → checkpoint-doc → fall back to block-level APIs

checkpoint-doc = recovery material, not permission to bypass unsafe check.
```

**Stop conditions (ask user):** no token/URL · wrong workspace · multiple plausible targets before write · destructive operation without confirmation · notebook id unknown for daily notes.

## Mode gate

**Fast path**: read/list/search, or create/append with explicit stable target.

**Slow path** (inspect → strategy → write → verify): editing existing content · target is title/keyword/hpath · affects multiple blocks or document block · may regenerate ids · destructive/approval-gated.

## Canonical input patterns

Two mechanisms. Check `--help` INPUT SOURCES for which parameters support field-level sources.

```bash
# Field-level: heredoc (param supports stdin, e.g. --data, --stmt, --markdown)
siyuan api block.appendBlock --parentID <id> --data @stdin --yes <<'EOF'
Content here.
EOF

# Field-level: @file: (param supports file)
siyuan api block.updateBlock --id <id> --data @file:./content.md --dataType markdown --yes

# Field-level: pipe (param supports stdin)
cat query.sql | siyuan api query.sql --stmt @stdin

# Whole-payload: -j inline JSON (all commands, useful when no field-level source)
siyuan api attr.setBlockAttrs -j '{"id":"<id>","attrs":{"custom-key":"value"}}'

# Whole-payload: -f from file (all commands, useful for large payloads)
siyuan api block.batchUpdateBlock -f ./blocks.json --yes

# Temp file workflow (for local editing round-trips)
siyuan tool get-block-content <doc-id> --range children --limit=-1 --bodyOnly true > "$TMPDIR/doc.md"
# ... edit locally ...
siyuan tool brute-edit <doc-id> --overwrite @file:$TMPDIR/doc.md --dry-run
siyuan tool brute-edit <doc-id> --overwrite @file:$TMPDIR/doc.md --yes
rm "$TMPDIR/doc.md"
```

## Hot-path operations

Common safe operations. For complex/risky operations, read the linked recipe.

### Append (fast path — no pre-inspection needed)

```bash
siyuan api block.appendBlock --parentID <id> --data @stdin --yes <<'EOF'
Content.
EOF

# Daily note (notebook id must be known — if unknown, list notebooks or ask user)
siyuan api block.appendDailyNoteBlock --notebook <notebook-id> --data @stdin --yes <<'EOF'
Entry.
EOF
```

### Search and read (fast path)

```bash
siyuan api filetree.searchDocs --k "<keyword>"    # candidates — verify before writing
siyuan tool get-block-info <id>                   # confirm identity
siyuan tool get-block-content <id> --range children --limit 50
siyuan tool get-block-content <id> --range context --limit 7 --showId true

# Locate specific blocks in a long document by pattern (like grep for blocks)
siyuan tool locate-block --id <doc-id> --pattern "%keyword%"
```

### Update known block (fast command, slow pre-flight ⚠️)

All pre-conditions must be met: (a) workspace confirmed, (b) target is stable block id, (c) current content inspected, (d) user intent maps to this block. Otherwise → slow path via `recipes/edit-content.md`.

```bash
siyuan api block.updateBlock --id <block-id> --dataType markdown --data @stdin --yes <<'EOF'
Replacement.
EOF
```

## Error triage

| Exit | Meaning | Action |
|------|---------|--------|
| 0 | Success | Parse stdout |
| 1 | General (kernel error, approval rejected/timeout, not found) | Read stderr JSON |
| 2 | Config/workspace | `siyuan workspace which` |
| 3 | Network (kernel not running) | Ask user to start SiYuan |
| 4 | Auth/token | Ask user for token |
| 5 | Permission denied | Check rules: `siyuan workspace which` |

stderr = JSON diagnostics; stdout = result data.

## Routing table

| User wants to... | Action |
|------------------|--------|
| Connect/debug workspace | `siyuan doc read recipes/connect-workspace.md` |
| Locate user-mentioned doc/block | `siyuan doc read recipes/find-target.md` |
| Read content (ranges, paging, ids) | `siyuan doc read recipes/read-content.md` |
| Edit/move/delete/batch/create doc | `siyuan doc read recipes/edit-content.md` |
| Daily notes (append, query, date range) | `siyuan doc read siyuan-guide/dailynote-model.md` |
| Block/path/sql model | `siyuan doc read siyuan-guide/siyuan-block.md` |
| Permissions/approval config | `siyuan doc read cli-usage/permission.md` |
| Extend CLI (custom API/tool) | `siyuan doc read cli-usage/extension.md` |
| Deep CLI mechanics: flags, input-source edge cases, stdout/stderr, Approval Center, MSYS details | `siyuan doc read cli-usage/cli-overview.md` |

## Layer routing

| Task shape | Prefer |
|------------|--------|
| Read/edit notes | CLI commands + recipes |
| One kernel call, known endpoint | registered `api` |
| Multi-step operation | `tool` |
| One-off missing kernel API | `api raw` (no schema/guard) |
| Repeated missing API | API extension |
| Repeated multi-call workflow | tool extension |
| Domain workflow with user policy | downstream Agent SKILL |

## First response rules

- **Content tasks**: use the installed `siyuan` CLI. Do not inspect source unless user asks to modify siyuan-cli internals.
- **User-named targets** (title, keyword, hpath, date phrase): `recipes/find-target.md` first.
- **Writes beyond append-only**: also read `recipes/edit-content.md`.

## Key domain rules

- Block is primary entity; document = container block (`type='d'`).
- Stable addressing: **id > root_id > path**. Never use hpath/title as stable key.
- `parent_id` = parent-child. `root_id` = owning document. `box` = notebook.
- Non-document blocks' `path`/`hpath` describe the containing document, not the block.
- SQL: always `LIMIT`; narrow with `root_id`/`box`/`type` before fuzzy `LIKE`.
- Full model: `siyuan doc read siyuan-guide/siyuan-block.md`

## Gotchas

- Windows Git Bash / MSYS rewrites leading `/` paths → `MSYS_NO_PATHCONV=1 ...` or `//path`.
- `--showId true` injects `@@id@@type` markers — not source text. Never use as brute-edit search/overwrite content.
- Endpoint choice: registered > `api raw`. Avoid long-lived `rawApi.allow: ["*"]`.

## Internals

For extension typing: `siyuan doc read cli-usage/extension.md`, then inspect `dist/shared/schema.d.mts` in the installed package.

GitHub: [siyuan-cli](https://github.com/frostime/siyuan-cli) · [SiYuan kernel API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)

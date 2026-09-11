---
title: CLI Overview
slug: cli-overview
summary: Command structure, flags, input sources, and error handling for siyuan-cli.
---

# CLI Overview

## Calling kernel APIs

Endpoint id: `<group>.<name>` (derived from kernel path `/api/<group>/<name>`).

```bash
siyuan-cli api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"  # positional
siyuan-cli api block.getBlockKramdown --id 20260417120000-abcdefg                 # named flags
```

Discovery: `siyuan-cli api list` · `siyuan-cli api list --group block` · `siyuan-cli api describe <id>` · `<id> --help`

### Raw fallback

`api raw` calls unregistered kernel endpoints directly. Requires config opt-in and allowlist:

```yaml
behavior:
  rawApi:
    enabled: true
    allow: ["asset.getUnusedAssets"]
```

```bash
siyuan-cli api raw asset.getUnusedAssets -j '{}'
```

Raw stdout is pure JSON `data` (pipe to `jq`); warnings go to stderr. Bypasses schema validation, guards, response filtering, and compact formatting. → `workspace-config.md` §Raw API fallback.

Workspace selection → `recipes/workspace.md`.

## Using tools

Tools compose multiple API calls into one command.

```bash
siyuan-cli tool list
siyuan-cli tool list-doc-tree --entry <notebook-or-doc-id> --depth 2
siyuan-cli tool get-block-content <id> --range context --limit 7 --showId true
```

Discovery: `siyuan-cli tool list` · `siyuan-cli tool describe <id>` · `<id> --help`

### Output modes

Both `api` and `tool` default to compact human-readable text. Override with:

```bash
<command> ... --print compact   # explicit compact text
<command> ... --print json      # envelope JSON (machine-readable)
```

`api raw` always prints raw JSON `data` (ignores `--print`).

## Global flags

All `siyuan-cli api <id>` and `siyuan-cli tool <id>` commands accept:

| Flag | Short | Meaning |
|------|-------|---------|
| `--workspace` | `-w` | Override active workspace name |
| `--baseUrl` | | Ad-hoc kernel URL (skips workspace resolution entirely) |
| `--token` | | Override authentication token |
| `--config` | | Override config file path |
| `--dry-run` | | Preview write operations without calling kernel. For workflow tools such as `brute-edit`, dry-run may also perform local read/planning checks and return an edit plan. |
| `--yes` | `-y` | Execute approval-gated writes immediately without opening the Approval Center. Ignored when `behavior.allowYes` is `false` |
| `--debug` | | Print intended request (curl-equivalent) to stderr |
| `--json` | `-j` | Entire payload as inline JSON |
| `--file` | `-f` | Entire payload from JSON file; `-f -` reads stdin |
| `--print compact\|json` | | Output mode: compact text or envelope JSON; defaults to compact. `api raw` ignores this and always prints raw JSON `data`. |

## Input sources

Some fields accept values from external sources beyond literal strings. Which fields support which sources is declared per endpoint — check `<endpoint> --help` for the INPUT SOURCES section.

| Syntax | Meaning |
|--------|---------|
| `"plain text"` | Literal value (default, always available) |
| `@file:./path` | Read content from file (resolved from cwd) |
| `@stdin` | Read from stdin (once per invocation) |
| `@env:VAR_NAME` | Read from environment variable |
| `@@file:...` | Escape — pass the literal string `@file:...` |

Constraints:

- stdin is single-use: `@stdin` in one field + `--file -` throws `STDIN_CONFLICT`.
- `@stdin` with no pipe attached throws `STDIN_IS_TTY`.
- `@env:VAR` where VAR is unset throws `ENV_NOT_SET`.

Usage examples:

```bash
# pipe
echo "SELECT id FROM blocks LIMIT 5" | siyuan-cli api query.sql --stmt @stdin

# shell heredoc (bash) / here-string (PowerShell @'...'@) — no temp file needed, preferred for multiline input
siyuan-cli api query.sql --stmt @stdin <<'EOF'
SELECT id, content
FROM blocks
WHERE type = 'd' AND content LIKE '%keyword%'
LIMIT 10
EOF

# multiple long inputs in one command — use @file: for each
siyuan-cli tool update-block --blocks @file:./updates.json --yes
```

## Git Bash / MSYS path conversion

On Windows Git Bash / MSYS shells, arguments starting with `/` may be rewritten into Windows paths before the CLI receives them. This affects SiYuan virtual paths such as `--path "/TestDoc"` or `--toPath "/inbox"`.

Prefer disabling shell-side conversion for the command:

```bash
MSYS_NO_PATHCONV=1 siyuan-cli api filetree.getIDsByHPath --notebook <id> --path "/TestDoc"
MSYS_NO_PATHCONV=1 siyuan-cli api filetree.createDocWithMd --notebook <id> --path "/inbox/note" --markdown @file:./note.md
```

A Git Bash / MSYS-specific escape also works: write the leading slash as `//` so the CLI receives `/...`.

```bash
siyuan-cli api filetree.getIDsByHPath --notebook <id> --path //TestDoc
```

## Error handling

Warnings and errors are written to stderr as single-line JSON, stdout remains clean:

```json
{"error":"WORKSPACE_NOT_FOUND","message":"...","hint":"Run `siyuan-cli workspace list`..."}
```

### Exit codes

| Code | Category | Typical cause |
|------|----------|---------------|
| 0 | Success | — |
| 1 | General | kernel error, invalid payload, approval rejected/timed out/cancelled, block not found |
| 2 | Config | missing workspace, invalid config, bad schema version, project config error |
| 3 | Network | connection refused, timeout |
| 4 | Auth | 401 from kernel |
| 5 | Permission | endpoint or content denied by policy |

### Common warning codes

| `warning` field | Meaning | Agent action |
|-----------------|---------|--------------|
| `CONTENT_FILTERED` | Some response items or fields were removed by permission rules | Treat stdout as a valid but incomplete view; do not infer missing content does not exist |
| `IMPLICIT_WORKSPACE` | A non-read or high-severity operation used `config.current` instead of an explicit workspace/project anchor | Confirm workspace before proceeding |
| `RAW_API_NO_SCHEMA_GUARD` | `api raw` bypassed schema validation, resource guard, and response filtering | Use only for intended one-off raw calls; prefer registered endpoints/extensions when possible |

### Common error codes

| `error` field | Exit | Action |
|---------------|------|--------|
| `PAYLOAD_INVALID` | 1 | Fix input, retry |
| `APPROVAL_REJECTED` | 1 | Review the pending action and retry only if intended |
| `APPROVAL_TIMEOUT` | 1 | Re-run the command or approve it faster next time |
| `APPROVAL_CANCELLED` | 1 | Re-run if the write is still intended |
| `APPROVAL_UNAVAILABLE` | 1 | Approval flow was unavailable; retry with `--yes` (if `behavior.allowYes` is `true`) or inspect broker state |
| `KERNEL_ERROR` | 1 | Show message as-is; likely a data-level problem |
| `BLOCK_NOT_FOUND` | 1 | Verify the block id exists |
| `NO_WORKSPACE` | 2 | Run `siyuan-cli workspace add` |
| `WORKSPACE_NOT_FOUND` | 2 | Check name with `siyuan-cli workspace list` |
| `ECONNREFUSED` | 3 | Start SiYuan kernel |
| `UNAUTHORIZED` | 4 | Check token |
| `ENDPOINT_DENIED` | 5 | Review permission rules |
| `CONTENT_DENIED` | 5 | Review permission rules for notebook/path scope |

### Debugging permissions

See `permission.md` for the full reference. Quick diagnostic:

```bash
siyuan-cli current which                # see resolved workspace and selection source
siyuan-cli api <id> --debug             # see assembled payload
```

## Reading bundled resources

Address resources by the exact path shown in the `siyuan-cli skill read` manifest (e.g. `recipes/find-target.md`). An unmatched path fails with `SKILL_RESOURCE_NOT_FOUND` — re-read the manifest instead of guessing a filename.

## Debugging

```bash
siyuan-cli current which                # resolution for current directory
siyuan-cli current verify               # verify the effective workspace (cwd-aware)
siyuan-cli workspace verify <name>      # verify a named catalog entry
siyuan-cli workspace verify --all       # verify all named catalog entries
siyuan-cli api <id> --debug             # curl-equivalent to stderr
siyuan-cli api <id> ... --dry-run       # preview writes
```

Approval commands: `siyuan-cli approval status|list|open|approve|reject`. Broker config and lifecycle → `workspace-config.md` §Behavior. Workspace selection → `recipes/workspace.md`. Permission rules → `permission.md`.

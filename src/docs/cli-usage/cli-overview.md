---
title: CLI Overview
slug: cli-overview
summary: Command structure, flags, input sources, and error handling for siyuan-cli.
---

# CLI Overview

## Command structure

```text
siyuan
├── workspace    Manage kernel connections
│   ├── add      Add a workspace
│   ├── list     List workspaces
│   ├── use      Set active workspace
│   ├── verify   Test connection
│   ├── remove   Remove a workspace
│   └── which    Show current resolution
├── api          Call kernel endpoints directly
│   ├── list     List available endpoints
│   ├── describe Show endpoint schema
│   └── <id>     Call an endpoint (e.g. query.sql, block.getBlockKramdown)
├── tool         Run high-level composite tools
│   ├── list     List available tools
│   └── <id>     Run a tool (e.g. list-doc-tree, append-content)
└── skill        Manage agent skills
    ├── list     List builtin skills
    ├── read     Read a skill file
    ├── install  Install to agent environment
    └── uninstall
```

## Calling kernel APIs

Endpoint id format: `<group>.<name>`, derived from kernel path `/api/<group>/<name>`.

```bash
# Positional primary field
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"

# Named flags
siyuan api block.getBlockKramdown --id 20260417120000-abcdefg

# JSON payload
siyuan api block.updateBlock -j '{"id":"...","data":"...","dataType":"markdown"}'

# From file
siyuan api query.sql -f query.json
```

### Discovery

```bash
siyuan api list                    # all endpoints
siyuan api list --group block      # filter by group
siyuan api describe query.sql      # schema details
siyuan api query.sql --help        # usage + examples
```

## Using tools

Tools compose multiple endpoint calls into a single workflow.

```bash
siyuan tool list
siyuan tool resolve-path --hpath "/日记/2025-01"
siyuan tool append-content --targetId <id> --targetType document --markdown @file:./note.md
```

### Output modes

By default, stdout is a human-readable `content` string. Structured data is available via flags:

```bash
siyuan tool <id> ...                  # content only (human-readable)
siyuan tool <id> ... --details        # { content, details }
siyuan tool <id> ... --only details   # structured JSON only (machine-readable)
```

## Global flags

All `siyuan api <id>` and `siyuan tool <id>` commands accept:

| Flag | Short | Meaning |
|------|-------|---------|
| `--workspace` | `-w` | Override active workspace name |
| `--baseUrl` | | Ad-hoc kernel URL (skips workspace resolution entirely) |
| `--token` | | Override authentication token |
| `--config` | | Override config file path |
| `--dry-run` | | Preview write operations without calling kernel |
| `--yes` | `-y` | Auto-confirm destructive operations |
| `--debug` | | Print intended request (curl-equivalent) to stderr |
| `--json` | `-j` | Entire payload as inline JSON |
| `--file` | `-f` | Entire payload from JSON file; `-f -` reads stdin |

Tools additionally accept:

| Flag | Meaning |
|------|---------|
| `--details` | stdout becomes `{ content, details }` |
| `--only content\|details` | stdout contains only that part |

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

## Error handling

Errors are written to stderr as single-line JSON, stdout remains clean:

```json
{"error":"WORKSPACE_NOT_FOUND","message":"...","hint":"Run `siyuan workspace list`..."}
```

### Exit codes

| Code | Category | Typical cause |
|------|----------|---------------|
| 0 | Success | — |
| 1 | General | kernel error, invalid payload, confirmation required, block not found |
| 2 | Config | missing workspace, invalid config, bad schema version, project config error |
| 3 | Network | connection refused, timeout |
| 4 | Auth | 401 from kernel |
| 5 | Permission | endpoint or content denied by policy |

### Common error codes

| `error` field | Exit | Action |
|---------------|------|--------|
| `PAYLOAD_INVALID` | 1 | Fix input, retry |
| `CONFIRMATION_REQUIRED` | 1 | Retry with `--yes` if appropriate |
| `KERNEL_ERROR` | 1 | Show message as-is; likely a data-level problem |
| `BLOCK_NOT_FOUND` | 1 | Verify the block id exists |
| `NO_WORKSPACE` | 2 | Run `siyuan workspace add` |
| `WORKSPACE_NOT_FOUND` | 2 | Check name with `siyuan workspace list` |
| `ECONNREFUSED` | 3 | Start SiYuan kernel |
| `UNAUTHORIZED` | 4 | Check token |
| `ENDPOINT_DENIED` | 5 | Review permission rules |
| `CONTENT_DENIED` | 5 | Review permission rules for notebook/path scope |

### Agent error handling pattern

```text
exit 0          → parse stdout as result
exit 1 + CONFIRMATION_REQUIRED → re-invoke with --yes (if policy permits)
exit 1 + PAYLOAD_INVALID       → fix input and retry
exit 2/3/4      → environment issue; surface to user
exit 5          → permission policy blocks this; check config rules
```

## Debugging

```bash
siyuan workspace which              # show resolution for current directory
siyuan workspace verify <name>      # test connection + auth
siyuan api <id> --debug             # print curl-equivalent to stderr
siyuan api <id> ... --dry-run       # preview write operations
```

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
│   ├── describe Show tool schema
│   └── <id>     Run a tool (e.g. list-doc-tree, append-content)
├── doc          Discover shipped docs
│   ├── list     List built-in docs with real file paths
│   └── read     Read a built-in doc by path or unique basename
├── approval     Manage the local human-approval broker and queue
│   ├── status   Show broker status
│   ├── list     List pending and recent approvals
│   ├── show     Show one approval request
│   ├── approve  Approve one request from the terminal
│   ├── reject   Reject one request from the terminal
│   ├── open     Open the Approval Center in the browser
│   └── stop     Stop the broker
├── skill        Manage the bundled agent skill
│   ├── install  Install or update to a target
│   ├── read     Read the bundled SKILL.md
│   └── uninstall
└── extension    Manage user extensions
    ├── init     Scaffold the extensions directory
    ├── list     List discovered extensions
    └── cache    Load extensions and write schema cache files
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

### Output modes

By default, stdout uses compact endpoint rendering when available, with raw JSON fallback:

```bash
siyuan api query.sql "SELECT id, hpath FROM blocks LIMIT 5"   # compact text by default
siyuan api query.sql "SELECT id, hpath FROM blocks LIMIT 5" --print compact
siyuan api query.sql "SELECT id, hpath FROM blocks LIMIT 5" --print json
```

## Using tools

Tools compose multiple endpoint calls into a single workflow.

```bash
siyuan tool list
siyuan tool resolve-path --hpath "/diary/2025-01"
siyuan tool append-content --targetId <id> --targetType document --markdown @file:./note.md
```

### Output modes

By default, stdout is a human-readable `content` string. Structured data is available with `--print json`:

```bash
siyuan tool <id> ...                  # compact content (human-readable)
siyuan tool <id> ... --print compact  # compact content (explicit)
siyuan tool <id> ... --print json     # envelope JSON (machine-readable)
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
| `--yes` | `-y` | Execute approval-gated writes immediately without opening the Approval Center. Ignored when `behavior.allowYes` is `false` |
| `--debug` | | Print intended request (curl-equivalent) to stderr |
| `--json` | `-j` | Entire payload as inline JSON |
| `--file` | `-f` | Entire payload from JSON file; `-f -` reads stdin |

APIs and tools additionally accept:

| Flag | Meaning |
|------|---------|
| `--print compact\|json` | Choose output mode; APIs use compact formatter text or envelope JSON, tools use compact content or envelope JSON |

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
echo "SELECT id FROM blocks LIMIT 5" | siyuan api query.sql --stmt @stdin

# shell heredoc — no temp file needed, preferred for multiline input
siyuan api query.sql --stmt @stdin <<'EOF'
SELECT id, content
FROM blocks
WHERE type = 'd' AND content LIKE '%keyword%'
LIMIT 10
EOF

siyuan tool append-content --targetId <id> --targetType document --markdown @stdin <<'EOF'
## New section

Paragraph content here.
EOF

# multiple long inputs in one command — use @file: for each
siyuan api block.updateBlock --id <id> --data @file:./content.md --dataType markdown
```

## Git Bash / MSYS path conversion

On Windows Git Bash / MSYS shells, arguments starting with `/` may be rewritten into Windows paths before the CLI receives them. This affects SiYuan virtual paths such as `--hpath "/TestDoc"` or `--toPath "/inbox"`.

Prefer disabling shell-side conversion for the command:

```bash
MSYS_NO_PATHCONV=1 pnpm run siyuan tool resolve-path --hpath "/TestDoc"
MSYS_NO_PATHCONV=1 pnpm run siyuan tool push-md ./note.md --notebook <id> --toPath /inbox
```

A Git Bash / MSYS-specific escape also works: write the leading slash as `//` so the CLI receives `/...`.

```bash
pnpm run siyuan tool resolve-path --hpath //TestDoc
pnpm run siyuan tool push-md ./note.md --notebook <id> --toPath //inbox
pnpm run siyuan tool push-md ./note.md --notebook <id> --toPath //
```

## Error handling

Errors are written to stderr as single-line JSON, stdout remains clean:

```json
{"error":"WORKSPACE_NOT_FOUND","message":"...","hint":"Run `siyuan workspace list`..."}
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
| `NO_WORKSPACE` | 2 | Run `siyuan workspace add` |
| `WORKSPACE_NOT_FOUND` | 2 | Check name with `siyuan workspace list` |
| `ECONNREFUSED` | 3 | Start SiYuan kernel |
| `UNAUTHORIZED` | 4 | Check token |
| `ENDPOINT_DENIED` | 5 | Review permission rules |
| `CONTENT_DENIED` | 5 | Review permission rules for notebook/path scope |

### Agent error handling pattern

```text
exit 0          → parse stdout as result
exit 1 + APPROVAL_*           → surface the decision outcome to the user
exit 1 + APPROVAL_UNAVAILABLE → approval flow unavailable; re-invoke with --yes only if `behavior.allowYes` is true
exit 1 + PAYLOAD_INVALID       → fix input and retry
exit 2/3/4      → environment issue; surface to user
exit 5          → permission policy blocks this; check config rules
```

### Debugging permissions

See `permission.md` for the full reference. Quick diagnostic:

```bash
siyuan workspace which              # see resolved workspace + full rule list
siyuan api <id> --debug             # see assembled payload
```

Common fixes:
- `ENDPOINT_DENIED` → `siyuan workspace which` to see rules, add an allow rule
- `CONTENT_DENIED` → rules may restrict writes to this notebook/path; inspect rule list
- `APPROVAL_UNAVAILABLE` → broker not running; retry with `--yes` only when safe

## Built-in docs

The CLI ships docs on disk and discloses the real docs root path in `siyuan --help` and `siyuan doc --help`.

```bash
siyuan doc list
siyuan doc read README.md
siyuan doc read edit-content
```

## Skill install targets

```bash
siyuan skill install
siyuan skill install --target agents
siyuan skill install --target claude
siyuan skill install --target .pi --local
```

Normalization rules:

- `agents` and `claude` are explicit home-directory shortcuts
- generic target names normalize to leading-dot form
- `pi` and `.pi` resolve to the same target family
- `--local` switches the base directory from the home directory to the current project directory

## Approval Center

When a write requires approval and `--yes` is absent (or ignored due to `behavior.allowYes: false`), the CLI submits a request to the local Approval Broker, opens `http://127.0.0.1:<port>/approval`, and waits inline for up to `behavior.approval.timeout` seconds (default 60).

```bash
siyuan approval status
siyuan approval list
siyuan approval open
siyuan approval approve <request-id>
siyuan approval reject <request-id>
```

Broker lifecycle:
- lazy start on the first approval-gated write
- stays alive while pending requests exist
- queue-empty grace period: 30s
- hard idle timeout: 5min
- browser polling does not keep the broker alive

## Debugging

```bash
siyuan workspace which              # show resolution for current directory
siyuan workspace verify             # verify effective workspace (cwd-aware)
siyuan workspace verify <name>      # verify a specific workspace by name
siyuan workspace verify --global-current  # verify global config.current only
siyuan api <id> --debug             # print curl-equivalent to stderr
siyuan api <id> ... --dry-run       # preview write operations
```

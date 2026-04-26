# siyuan-cli

An agent-first CLI for [SiYuan Note](https://b3log.org/siyuan/). It sits between your agent and the SiYuan kernel, providing workspace identity, permission guardrails, a structured API surface, and built-in docs for agent self-orientation.

## Why This CLI

SiYuan exposes an HTTP API — one could call it directly with curl. This CLI exists because raw HTTP calls don't scale well in agentic workflows.

**Workspace management.** When multiple agents, sessions, or projects connect to different SiYuan instances, keeping credentials and base URLs consistent becomes brittle. `siyuan-cli` stores named workspaces globally and lets each project pin itself to one via a `.siyuan-cli.yaml` file at its root — safe to commit, cannot hold secrets. Resolution priority is explicit: `--workspace` flag → `$SIYUAN_CLI_WORKSPACE` → `.siyuan-cli.yaml` → `config.current`.

**Permission layer.** Agents operating on personal notes need guardrails. The CLI enforces deny and allow rules per workspace — blocking specific endpoints, restricting content access to certain notebooks or ID-based paths. Rules are declarative YAML and evaluated before any kernel request is sent.

**Structured API surface.** Each registered SiYuan endpoint becomes a typed subcommand with named flags, schema introspection, `--help`, `--dry-run` preview, and compact output formatting. The current built-in set covers [SiYuan's public API](https://github.com/siyuan-note/siyuan/blob/master/API.md) plus a small number of necessary non-public endpoints. Support for user-defined custom endpoints is planned.

**High-level tools and built-in docs.** Beyond raw API calls, the CLI ships composite tools (document tree traversal, daily note listing, content append) and a full doc set that agents can discover and read through the CLI itself — so an agent can orient itself without external documentation.

## Install

```bash
npm install -g @frostime/siyuan-cli
# or
pnpm add -g @frostime/siyuan-cli
```

## Quick Start

```bash
# Add a workspace pointing at your local SiYuan kernel
siyuan workspace add local --url http://127.0.0.1:6806 --token <token>

# Verify the connection
siyuan workspace verify local

# Run a SQL query
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"

# Read block content
siyuan api block.getBlockKramdown --id <block-id>

# Append markdown to a document
siyuan tool append-content --targetId <doc-id> --targetType document --markdown "## New section"

# Install the bundled agent skill
siyuan skill install
```

## Commands

```text
siyuan
├── workspace    Manage kernel connections
│   ├── add      Register a new workspace
│   ├── list     List all workspaces
│   ├── use      Set active workspace
│   ├── verify   Test connection and auth
│   ├── remove   Remove a workspace
│   └── which    Show workspace resolution for the current directory
├── api          Call kernel endpoints
│   ├── list     List registered endpoints (--group, --tag)
│   ├── describe Show endpoint schema
│   └── <id>     Call an endpoint (e.g. query.sql, block.appendBlock)
├── tool         Run high-level composite tools
│   ├── list     List available tools
│   ├── describe Show tool schema
│   └── <id>     Run a tool (e.g. list-doc-tree, append-content)
├── doc          Discover and read built-in docs
│   ├── list     List docs with real file paths
│   └── read     Read a doc by path or name
├── approval     Manage the local human-approval broker
│   ├── status   Show broker status
│   ├── list     List pending and recent approvals
│   ├── show     Show one approval request
│   ├── approve  Approve a request from the terminal
│   ├── reject   Reject a request from the terminal
│   ├── open     Open the Approval Center in the browser
│   └── stop     Stop the broker
└── skill        Manage the bundled agent skill
    ├── install  Install or update to a target directory
    ├── read     Read the bundled SKILL.md
    └── uninstall
```

Every `api <id>` and `tool <id>` subcommand supports `--help` for full parameter and example details.

### Key flags

All `api` and `tool` invocations share these flags:

| Flag | Description |
|------|-------------|
| `-w, --workspace` | Override active workspace |
| `--baseUrl / --token` | Ad-hoc connection without a configured workspace |
| `--dry-run` | Preview write operations without sending to kernel |
| `-y, --yes` | Bypass approval-gated operations when allowed by config |
| `--print compact\|json` | Output mode — compact text (default) or raw JSON |
| `-j, --json` / `-f, --file` | Pass payload as inline JSON or from a file (`-` for stdin) |
| `--debug` | Print curl-equivalent request to stderr |

Some string fields accept `@file:./path`, `@stdin`, or `@env:VAR` as input sources — check `<endpoint> --help` for which fields support them.

### Available tools

| Tool | Description |
|------|-------------|
| `list-doc-tree` | Document tree under a notebook or document |
| `list-dailynote` | Daily note documents for a date or range |
| `append-content` | Append markdown to a daily note, document, or block |
| `get-block-content` | Read markdown content of a block or document |
| `get-block-info` | Inspect metadata for one or more blocks |
| `resolve-path` | Resolve hpath or id to stable SiYuan path |

## Configuration

Config file location: `~/.config/siyuan-cli/config.yaml` (created automatically by `workspace add`; also respects `$XDG_CONFIG_HOME` and `$SIYUAN_CLI_CONFIG`).

```yaml
schemaVersion: 1
current: local

workspaces:
  local:
    baseUrl: http://127.0.0.1:6806
    token: <literal-token>

  prod:
    baseUrl: http://192.168.1.100:6806
    tokenSource:
      type: env
      value: SIYUAN_TOKEN
    permission:
      default: allow
      rules:
        - endpoint: "system.exit"
          effect: deny
        - path: "/20260107143325-zbrtqup/**"
          action: write
          effect: deny

defaults:
  permission:
    default: allow
    rules: []
```

### Permission rules

Permission rules are evaluated before any request reaches the kernel. A `deny` rule is a hard block. An `approval` rule opens the Approval Center and waits for human approval before proceeding. Legacy configs that use `confirm` are normalized to `approval`.

Rules can target endpoints by id or glob, content by notebook id or ID-based `path` (not `hpath` — those change on rename), and operations by mode (`read`, `write`, `invoke`) or surface (`content`, `workspace`, `runtime`, `network`).

See `.siyuan-cli.yaml.example` in this repo and `siyuan doc read config-and-permission` for the full rule schema.

### Project-level config

Place a `.siyuan-cli.yaml` at your project root to pin that project to a specific workspace:

```yaml
schemaVersion: 1
workspace: prod   # must exist in the global config
```

This file is safe to commit — the CLI hard-errors if you attempt to put connection details or tokens here. Check `siyuan workspace which` to inspect resolution for the current directory.

## Built-in docs

The CLI ships a full reference on disk. Agents can discover and read it directly:

```bash
siyuan doc list          # list all docs with real file paths
siyuan doc read README.md
siyuan doc read edit-content
```

The docs root path is also printed by `siyuan --help` and `siyuan doc --help`, so an agent can read docs files directly without going through the CLI.

## License

GPL-v3

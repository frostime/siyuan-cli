# siyuan-cli

Agent-first CLI for [SiYuan Note](https://b3log.org/siyuan/) — workspace management, kernel API proxy, workflow tools, and agent skill install.

## Features

- **Workspace management** — add / switch / verify multiple SiYuan kernel connections
- **Direct kernel API** — call any registered endpoint with argument validation and permission guard
- **Workflow tools** — higher-level operations (resolve path, append content, list daily notes, list doc tree)
- **Agent skill install** — install the bundled `siyuan-cli` skill to `.agents/`, `.claude/`, or custom directories
- **Dry-run & permission** — write endpoints support `--dry-run`; configurable deny/allow rules per notebook/path

## Install

```bash
# npm
npm install -g siyuan-cli

# pnpm
pnpm add -g siyuan-cli
```

## Quick Start

```bash
# 1. Add a workspace (your local SiYuan kernel)
siyuan workspace add local --url http://127.0.0.1:6806

# 2. Verify connectivity
siyuan workspace verify local

# 3. Query with SQL
siyuan api query.sql "SELECT id, content FROM blocks WHERE type='d' LIMIT 5"

# 4. List document tree
siyuan tool list-doc-tree --notebook "日记"

# 5. Resolve a human path to stable SiYuan path
siyuan tool resolve-path --hpath "/私人/日记"

# 6. Append markdown to a document
siyuan tool append-content --targetId <doc-id> --targetType document --markdown "Hello world"
```

## Commands

### `siyuan workspace`

Manage SiYuan kernel connections.

| Subcommand | Description |
|---|---|
| `add <name>` | Add a workspace (`--url`, `--token`, `--force`) |
| `list` | List all configured workspaces |
| `use <name>` | Set active workspace |
| `verify [name]` | Verify connectivity (`--all` for all) |
| `show [name]` | Show workspace details (`--reveal-token`) |
| `remove <name>` | Remove a workspace |

```bash
# Add with token from environment variable
siyuan workspace add prod --url http://192.168.1.100:6806 --token-env SIYUAN_TOKEN

# Add with token from file
siyuan workspace add prod --url http://192.168.1.100:6806 --token-file ~/.siyuan-token

# Ad-hoc call without adding workspace
siyuan api system.version --baseUrl http://192.168.1.100:6806 --token xxx
```

### `siyuan api`

Call SiYuan kernel API endpoints directly.

| Subcommand | Description |
|---|---|
| `list` | List all registered endpoints (`--group`, `--tag`) |
| `describe <id>` | Show endpoint schema |
| `<endpoint-id>` | Call an endpoint |

Every endpoint is a subcommand, so `--help` works:

```bash
siyuan api query.sql --help
siyuan api block.appendBlock --help
```

`--tag` filters derived endpoint tags such as `mode:read`, `surface:content`, `scope:batch`, `operation:move`, and `risk:sensitive`.

Common flags for all endpoints:

| Flag | Description |
|---|---|
| `-w, --workspace` | Workspace to use |
| `--baseUrl` | Ad-hoc base URL |
| `--token` | Ad-hoc token |
| `--dry-run` | Preview write request without sending |
| `-y, --yes` | Auto-confirm write operations |
| `--debug` | Show curl-equivalent debug info |
| `-j, --json` | Pass JSON payload inline |
| `-f, --file` | Load JSON payload from file (`-` for stdin) |

### `siyuan tool`

Run built-in workflow tools.

| Subcommand | Description |
|---|---|
| `list` | List all tools |
| `describe <id>` | Show tool schema |
| `<tool-id>` | Run a tool |

**Available tools:**

| Tool | Description |
|---|---|
| `list-doc-tree` | List document tree under a notebook or document |
| `list-dailynote` | List daily note documents for a date or range |
| `append-content` | Append markdown content to daily note, document, or block |
| `resolve-path` | Resolve hpath or id to stable SiYuan path |

Common flags (same as `api`, plus):

| Flag | Description |
|---|---|
| `--print compact\|json` | Choose tool output: compact text or details JSON |

### `siyuan skill`

Manage the bundled agent skill.

| Subcommand | Description |
|---|---|
| `list` | List builtin skills |
| `read <name>` | Read a skill file |
| `install <name>` | Install skill to target directory |
| `uninstall <name>` | Uninstall skill from target directory |

```bash
# Install to ~/.agents/skills/siyuan-cli/
siyuan skill install siyuan-cli

# Install for Claude Code project scope
siyuan skill install siyuan-cli --target claude-project

# Custom destination
siyuan skill install siyuan-cli --target custom --dest ./my-skills
```

## Configuration

Config file: `~/.config/siyuan-cli/config.yaml`

Override with environment variables:

| Variable | Description |
|---|---|
| `SIYUAN_CLI_CONFIG` | Custom config file path |
| `SIYUAN_CLI_WORKSPACE` | Default workspace name |
| `SIYUAN_CLI_TOKEN` | Default token |

Example config:

```yaml
schemaVersion: 2
current: local

defaults:
  permission:
    confirm:
      modes: ["write", "invoke"]
      surfaces: ["workspace", "runtime", "network"]
      scopes: ["batch", "global"]

workspaces:
  local:
    baseUrl: http://127.0.0.1:6806
  remote:
    baseUrl: http://192.168.1.100:6806
    tokenSource:
      type: env
      value: SIYUAN_TOKEN
```

### Permission Rules

Deny rules are the hard boundary. Confirm rules are an interactive safety rail.

`content.read.paths` and `content.write.paths` match against SiYuan `path` (ID-based document path), not `hpath`.

```yaml
workspaces:
  prod:
    baseUrl: http://prod:6806
    permission:
      endpoints:
        deny: ["system.exit", "network.*"]
      tools:
        allow: ["append-content", "list-doc-tree"]
      content:
        read:
          paths:
            deny: ["/20260107143325-zbrtqup/**"]
        write:
          paths:
            deny: ["/20260107143325-zbrtqup/**", "/20260108888888-qwertyu/**"]
      workspace:
        write:
          paths:
            deny: ["**"]
      confirm:
        modes: ["write", "invoke"]
        surfaces: ["workspace", "runtime", "network"]
        scopes: ["batch", "global"]
```

## Registered API Endpoints

| Group | Endpoints |
|---|---|
| `asset` | `upload` |
| `attr` | `getBlockAttrs`, `setBlockAttrs` |
| `block` | `appendBlock`, `deleteBlock`, `getBlockKramdown`, `getChildBlocks`, `insertBlock`, `updateBlock` |
| `export` | `exportMdContent` |
| `filetree` | `createDailyNote`, `createDocWithMd`, `getHPathByID`, `listDocsByPath`, `removeDoc`, `renameDoc` |
| `notebook` | `createNotebook`, `lsNotebooks` |
| `notification` | `pushMsg` |
| `query` | `sql` |
| `search` | `fullTextSearchBlock` |
| `system` | `bootProgress`, `version` |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm typecheck

# Run locally via npm script
pnpm siyuan -- workspace list

# Or link globally for `siyuan` command
pnpm link --global
siyuan --version

# Unlink when done
pnpm unlink --global
```

## Publish

```bash
# 1. Login to npm (first time)
npm login

# 2. Bump version (edit package.json or use npm version)
npm version patch  # 0.2.0 → 0.2.1

# 3. Publish
npm publish

# Or with pnpm
pnpm publish
```

The `prepublishOnly` hook runs `pnpm build` automatically before publish.

## License

MIT

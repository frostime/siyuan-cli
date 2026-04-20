---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, 思源笔记, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base. Supports workspace management, direct kernel APIs, and higher-level tools."
---

# SiYuan CLI

Use the `siyuan` command to interact with the user's SiYuan kernel.

## Quick start

1. Check CLI: `siyuan --version`
2. Check workspace: `siyuan workspace list`
3. If needed: `siyuan workspace add main --url http://127.0.0.1:6806 [--token <token>]`

## Bundled docs

Run `siyuan --help` to see the path to bundled reference docs:

- `siyuan-guide/` — SiYuan block model, document paths, SQL queries, daily notes
- `cli-usage/` — CLI commands, config file structure, permission rules

Read these before performing complex operations. In particular, `cli-usage/config-and-permission.md` covers how to write permission rules, and `siyuan-guide/sql-query-guide.md` covers how to query the five core tables (`blocks`, `refs`, `attributes`, `assets`, `spans`).

## Anchoring workspace

Multiple agents sharing `siyuan workspace use` can race — one agent's `use dev` silently changes the active workspace for all others.

Pin a project to a specific workspace with `.siyuan-cli.yaml` at the project root:

```yaml
# .siyuan-cli.yaml (safe to commit — cannot hold tokens or URLs)
schemaVersion: 1
workspace: <name from `siyuan workspace list`>
```

Inspect current resolution: `siyuan workspace which`

## Runtime values

- CLI version: `{{cli_version}}`
- Current workspace: `{{workspace}}`
- Base URL: `{{base_url}}`
- CLI path: `{{cli_path}}`
- Today: `{{today}}`

## Common patterns

### Query

```bash
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
```

### Resolve path

```bash
siyuan tool resolve-path --hpath "/私人/日记"
```

### Append content

```bash
siyuan tool append-content --targetId <id> --targetType document --markdown @file:./note.md
```

### Verify kernel

```bash
siyuan workspace verify main
siyuan api system.version
```

## Help discovery

```bash
siyuan --help                        # overview + docs path
siyuan api list                      # all endpoints
siyuan api <id> --help               # endpoint usage + examples
siyuan tool list                     # all tools
siyuan tool <id> --help              # tool usage
```

## Key rules

- Prefer `id` / `path` over `hpath` for stable addressing.
- Use `@file:` or `@stdin` for large text inputs.
- Write operations support `--dry-run`; destructive actions require `--yes`.
- Always `siyuan workspace which` before writes to confirm the target.
- Errors go to stderr as JSON; stdout stays clean. See `cli-usage/cli-overview.md` for exit code reference.

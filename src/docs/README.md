---
title: SiYuan CLI Docs
slug: docs-index
summary: Agent-facing reference shipped with siyuan-cli. Start here.
---

# SiYuan CLI Docs

## Quick start

```bash
siyuan workspace list                  # check configured workspaces
# If empty:
siyuan workspace add main --url http://127.0.0.1:6806 --token <token>
siyuan workspace verify main           # test connection

siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
```

## Workspace anchoring

Multiple agents or sessions sharing `siyuan workspace use` can race. Pin a project to a fixed workspace:

```yaml
# .siyuan-cli.yaml at project root — safe to commit (cannot hold tokens or URLs)
schemaVersion: 1
workspace: main    # must exist in `siyuan workspace list`
```

The global configuration is stored at `~/.config/siyuan-cli/config.yaml`. It set the workspace and permissions, see `cli-usage/config-and-permission.md` for details.

Inspect resolution: `siyuan workspace which`

Resolution priority: `--workspace` flag > `$SIYUAN_CLI_WORKSPACE` > `.siyuan-cli.yaml` > `config.current`.

## Key rules

- **Stable addressing**: prefer `id` and `path` over `hpath`. `hpath` changes on rename; `id` never changes.
- **SQL discipline**: always `LIMIT`; narrow scope with `root_id`, `box`, `type` before fuzzy `LIKE`.
- **Large text input**: use `@file:./path` or `@stdin` for markdown, SQL, templates.
- **Write safety**: `--dry-run` to preview, `--yes` to confirm destructive operations. Set `behavior.allowYes: false` in config to enforce the approval flow.
- **Pre-flight**: `siyuan workspace which` before writes to confirm target.
- **Error handling**: errors go to stderr as JSON, stdout stays clean. Exit codes: 0=OK, 1=general, 2=config, 3=network, 4=auth, 5=permission.

## Common patterns

```bash
# Search documents
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' AND content LIKE '%keyword%' LIMIT 10"

# Get block content
siyuan api block.getBlockKramdown --id <block-id>

# Resolve human-readable path
siyuan tool resolve-path --hpath "/private/diary"

# Append to document or daily note
siyuan tool append-content --targetId <id> --targetType document --markdown @file:./note.md

# List document tree
siyuan tool list-doc-tree --notebook <notebook-id>

# List daily notes by date range
siyuan tool list-dailynote --notebook <notebook-id> --from 20250101 --to 20250131
```

## Help discovery

```bash
siyuan --help                    # command overview + real docs root path
siyuan doc list                  # list built-in docs with real file paths
siyuan doc read README.md        # read a built-in doc through CLI
siyuan api list                  # all available endpoints
siyuan api <id> --help           # endpoint usage, parameters, examples
siyuan tool list                 # all available tools
siyuan tool <id> --help          # tool usage
siyuan workspace which           # current workspace resolution details
```

## Task recipes

Read these when you already know the job to do:

| File | Covers |
|------|--------|
| `recipes/connect-workspace.md` | Configure, verify, and anchor a workspace |
| `recipes/find-target.md` | Locate a document or block from id, path, hpath, notebook, or keyword |
| `recipes/read-content.md` | Read document or block content, including paging and id-aware inspection |
| `recipes/edit-content.md` | Update existing content with explicit inspection and verification |

## Detailed reference

### SiYuan domain knowledge (`siyuan-guide/`)

Read these to understand SiYuan's data model before operating on content.

| File | Covers |
|------|--------|
| `siyuan-guide/siyuan-block.md` | Block as primary data model, block types, container vs leaf, attributes, Markdown syntax extensions |
| `siyuan-guide/document-tree-and-paths.md` | id / parent_id / root_id / box / path / hpath — what each means and when to use which |
| `siyuan-guide/sql-query-guide.md` | Five core tables (`blocks`, `refs`, `attributes`, `assets`, `spans`), query patterns, strategy |
| `siyuan-guide/dailynote-model.md` | Daily note path template, attribute marker, date range queries |

### CLI usage and configuration (`cli-usage/`)

Read these for full command reference and config file format.

| File | Covers |
|------|--------|
| `cli-usage/cli-overview.md` | Full command tree, global flags, input sources (`@file`/`@stdin`/`@env`), all error codes, debugging |
| `cli-usage/config-and-permission.md` | `config.yaml` structure, token sources, permission rule syntax, evaluation order, project config, cascade |

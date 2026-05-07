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
# Or for local auto-discovery when port is unknown:
# siyuan workspace add devspace --workspace-dir /path/to/SiYuanDevSpace --token <token>
siyuan workspace verify main           # test connection

siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"

# User extensions
siyuan extension init               # scaffold ~/.config/siyuan-cli/extensions/
siyuan extension list               # see discovered extensions
siyuan extension cache              # batch-generate schema.json caches
```

## Workspace anchoring

Multiple agents or sessions sharing `siyuan workspace use` can race. Pin a project to a fixed workspace:

```yaml
# .siyuan-cli.yaml at project root — safe to commit (cannot hold tokens or URLs)
schemaVersion: 1
workspace: main    # must exist in `siyuan workspace list`
```

The global configuration is stored at `~/.config/siyuan-cli/config.yaml`. It sets the workspace and behavior; see `cli-usage/workspace-config.md` for details. For permission rules, see `cli-usage/permission.md`.

Inspect resolution: `siyuan workspace which`

Resolution priority: `--workspace` flag > `$SIYUAN_CLI_WORKSPACE` > `.siyuan-cli.yaml` > `config.current`.

## Key rules

- **Stable addressing**: prefer `id` and `path` over `hpath`. `hpath` changes on rename; `id` never changes.
- **SQL discipline**: always `LIMIT`; narrow scope with `root_id`, `box`, `type` before fuzzy `LIKE`.
- **Large text input**: use `@file:./path`, `@stdin`, or shell heredoc (`<<'EOF'`) for markdown, SQL, templates.
- **Windows Git Bash / MSYS**: SiYuan virtual paths starting with `/` may be rewritten by the shell. Prefer `MSYS_NO_PATHCONV=1 pnpm run siyuan ...`; `//path` and `//` are compatible fallbacks.
- **Write safety**: `--dry-run` to preview, `--yes` to bypass approval-gated operations when allowed. Set `behavior.allowYes: false` in config to enforce the approval flow.
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
# Git Bash / MSYS fallback
siyuan tool resolve-path --hpath //private/diary

# Append to document or daily note
siyuan tool append-content --targetId <id> --targetType document --markdown @file:./note.md

# List document tree
siyuan tool list-doc-tree --entry <notebook-or-doc-id> --depth 2

# List daily notes by date range
siyuan tool list-dailynote --notebookId <notebook-id> --afterDate 2025-01-01 --beforeDate 2025-01-31
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
siyuan extension list              # discovered extensions + cache status
siyuan extension --help            # extension management commands
siyuan workspace which           # current workspace resolution details
```

## Task recipes

Read these when you already know the job to do:

| File | Covers | Key commands |
|------|--------|-------------|
| `recipes/connect-workspace.md` | Configure, verify, and anchor a workspace | `siyuan workspace add/list/verify/which` |
| `recipes/find-target.md` | Locate a document or block from id, path, hpath, notebook, or keyword | `siyuan tool resolve-path`, `siyuan tool list-doc-tree`, `siyuan api filetree.searchDocs`, `siyuan api notebook.lsNotebooks` |
| `recipes/read-content.md` | Read document or block content, including paging and id-aware inspection | `siyuan tool get-block-content`, `siyuan tool get-block-info` |
| `recipes/edit-content.md` | Update existing content with explicit inspection and verification | `siyuan api block.updateBlock`, `siyuan tool append-content` |

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
| `cli-usage/workspace-config.md` | Config file location, workspace connections, token sources, behavior, project anchoring |
| `cli-usage/permission.md` | Permission rule syntax, evaluation order, risk-based auto-approval, two-phase checking, extension schema coupling, debugging |
| `cli-usage/extension.md` | Write custom API endpoints and workflow tools; schema authoring, cold-start workflow, examples |

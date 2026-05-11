---
title: SiYuan CLI Docs
slug: docs-index
summary: Agent-facing reference shipped with siyuan-cli. Start here when using `siyuan doc read README.md`.
---

# SiYuan CLI Docs

This page is the docs map. If you are an Agent with the installed `siyuan-cli` SKILL, follow the SKILL first; it is the operational router. Use this page to choose the right built-in document after you know the task shape.

## Quick start

```bash
siyuan workspace list                  # check configured workspaces
# If empty:
siyuan workspace add main --url http://127.0.0.1:6806 --token <token>
# Or for local auto-discovery when port is unknown:
# siyuan workspace add devspace --workspace-dir /path/to/SiYuanDevSpace --token <token>
siyuan workspace verify main           # test connection
siyuan workspace which                  # inspect effective resolution

siyuan api notebook.lsNotebooks
siyuan tool list-doc-tree --entry <notebook-or-doc-id> --depth 2
```

## How to use this docs set

| Directory | Role | Read when |
|-----------|------|-----------|
| `recipes/` | Scenario playbooks | You need to do a bounded task safely. |
| `siyuan-guide/` | SiYuan domain model | You need to understand blocks, paths, SQL, or daily notes. |
| `cli-usage/` | CLI mechanics and configuration | You need flags, config, permissions, extension authoring, or error behavior. |

## Start points

| Situation | Start with |
|-----------|------------|
| No workspace, wrong workspace, or connection failure | `recipes/connect-workspace.md` |
| User names a document/block without giving an id | `recipes/find-target.md` |
| Need to inspect or quote content | `recipes/read-content.md` |
| Need to append, edit, move, delete, or batch update | `recipes/edit-content.md` |
| Need to understand `id`, `path`, `hpath`, `root_id`, `box` | `siyuan-guide/document-tree-and-paths.md` |
| Need SQL query patterns or schema | `siyuan-guide/sql-query-guide.md` |
| Permission denied, approval popup, or filtered output | `cli-usage/permission.md` |
| Need custom API/tool runtime code | `cli-usage/extension.md` |

## Key rules

- **Stable addressing**: prefer `id` and `path` over `hpath`. `hpath` changes on rename; `id` never changes.
- **Workspace pre-flight**: run `siyuan workspace which` before writes.
- **SQL discipline**: always `LIMIT`; narrow scope with `root_id`, `box`, `type` before fuzzy `LIKE`.
- **Large text input**: use `@file:./path`, `@stdin`, or shell heredoc (`<<'EOF'`) for markdown, SQL, templates.
- **Windows Git Bash / MSYS**: SiYuan virtual paths starting with `/` may be rewritten by the shell. Prefer `MSYS_NO_PATHCONV=1 pnpm run siyuan ...`; `//path` and `//` are compatible fallbacks.
- **Write safety**: `--dry-run` to preview, `--yes` to bypass approval-gated operations when allowed. Set `behavior.allowYes: false` in config to enforce the approval flow.
- **Error handling**: errors go to stderr as JSON, stdout stays clean. Exit codes: 0=OK, 1=general, 2=config, 3=network, 4=auth, 5=permission.

## Help discovery

```bash
siyuan --help                    # command overview + real docs root path
siyuan doc list                  # list built-in docs with real file paths
siyuan doc read README.md        # read this docs map through CLI
siyuan api list                  # all available endpoints
siyuan api <id> --help           # endpoint usage, parameters, examples
siyuan tool list                 # all available tools
siyuan tool <id> --help          # tool usage
siyuan workspace which           # current workspace resolution details
siyuan extension list            # discovered extensions + cache status
```

## Built-in docs

### Recipes (`recipes/`)

| File | Covers |
|------|--------|
| `recipes/connect-workspace.md` | Configure, verify, anchor, and recover workspace connections. |
| `recipes/find-target.md` | Resolve user-visible hints into stable document/block ids. |
| `recipes/read-content.md` | Read document/block content safely, including id-aware inspection and paging. |
| `recipes/edit-content.md` | Update existing content with explicit inspection, strategy choice, and verification. |

### SiYuan domain knowledge (`siyuan-guide/`)

| File | Covers |
|------|--------|
| `siyuan-guide/siyuan-block.md` | Block as primary data model, block types, container vs leaf, attributes, Markdown syntax extensions. |
| `siyuan-guide/document-tree-and-paths.md` | id / parent_id / root_id / box / path / hpath — what each means and when to use which. |
| `siyuan-guide/sql-query-guide.md` | Five core tables (`blocks`, `refs`, `attributes`, `assets`, `spans`), query patterns, strategy. |
| `siyuan-guide/dailynote-model.md` | Daily note path template, attribute marker, date range queries. |

### CLI usage and configuration (`cli-usage/`)

| File | Covers |
|------|--------|
| `cli-usage/cli-overview.md` | Full command tree, global flags, input sources, all error codes, debugging. |
| `cli-usage/workspace-config.md` | Config file location, workspace connections, token sources, behavior, project anchoring. |
| `cli-usage/permission.md` | Permission rule syntax, evaluation order, risk-based auto-approval, two-phase checking, extension schema coupling, debugging. |
| `cli-usage/extension.md` | Write custom API endpoints and workflow tools; schema authoring, cold-start workflow, examples. |

---
title: SiYuan CLI Docs
slug: docs-index
summary: Agent-facing reference shipped with siyuan-cli. Start here when using `siyuan doc read README.md`.
---

# SiYuan CLI Docs

This page is the docs map. If you are an Agent with the installed `siyuan-cli` SKILL, follow the SKILL first; it is the operational router. Use this page to choose the right built-in document after you know the task shape.

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
| Need daily note creation, append, or date-range queries | `siyuan-guide/dailynote-model.md` |
| Permission denied, approval popup, or filtered output | `cli-usage/permission.md` |
| Need custom API/tool runtime code | `cli-usage/extension.md` |

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

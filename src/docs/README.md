---
title: SiYuan CLI Docs
slug: docs-index
summary: Agent-facing reference shipped with siyuan-cli.
---

# SiYuan CLI Docs

Two tracks. Read the one you need.

## `siyuan-guide/` — SiYuan domain knowledge

Read these to understand SiYuan's data model before operating on content.

1. `siyuan-guide/siyuan-block.md` — block as primary data model, block types, attributes, Markdown relationship
2. `siyuan-guide/document-tree-and-paths.md` — id / parent_id / root_id / box / path / hpath
3. `siyuan-guide/sql-query-guide.md` — blocks / refs / attributes / assets / spans tables and query patterns
4. `siyuan-guide/dailynote-model.md` — daily note path template, attribute marker, date range queries

## `cli-usage/` — CLI usage and configuration

Read these to understand how to configure and operate the CLI.

1. `cli-usage/cli-overview.md` — command structure, flags, input sources, error handling, debugging
2. `cli-usage/config-and-permission.md` — config.yaml structure, token sources, permission rules, project config

## Quick reference

```text
siyuan --help                # command overview + this docs path
siyuan api list              # available endpoints
siyuan api <id> --help       # endpoint usage
siyuan tool list             # available tools
siyuan tool <id> --help      # tool usage
siyuan workspace which       # current workspace resolution
```

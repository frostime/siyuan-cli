---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, 思源笔记, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
---

# SiYuan CLI

Agent-first CLI for SiYuan Note. Run `siyuan --help` to see bundled docs path for detailed reference.

## Core concepts

SiYuan is a block-centric database, not a Markdown filesystem.

- **Block** is the primary data entity. A document is a special container block (`type='d'`); paragraphs, headings, lists inside it are also blocks.
- **Key fields**: `id` (stable primary key), `parent_id` (direct parent), `root_id` (owning document), `box` (notebook id), `path` (id-based document path, stable), `hpath` (human-readable path, unstable).
- **Markdown** is the representation format, not the data model. Use `content` for search, `markdown` for format preservation.
- **SQL** is the query interface. Five tables: `blocks` (content), `refs` (references), `attributes` (metadata), `assets` (files), `spans` (inline elements).
- **Custom attributes** use `custom-` prefix (e.g. `custom-dailynote-20240101`).
- **Block reference syntax**: `((<BlockId> "anchor text"))`. Block link: `[text](siyuan://blocks/<BlockId>)`.

## Quick start

```bash
siyuan workspace add main --url http://127.0.0.1:6806 --token <token>
siyuan workspace verify main
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
```

## Common commands

```bash
# Discovery
siyuan api list                      # all endpoints
siyuan api <id> --help               # endpoint parameters and examples
siyuan tool list                     # all tools

# Query
siyuan api query.sql "SELECT id, content FROM blocks WHERE type='h' AND root_id='<doc-id>' LIMIT 20"

# Resolve path
siyuan tool resolve-path --hpath "/私人/日记"

# Append content
siyuan tool append-content --targetId <id> --targetType document --markdown @file:./note.md

# Document tree
siyuan tool list-doc-tree --notebook <notebook-id>

# Workspace
siyuan workspace which               # show current resolution
siyuan workspace list                 # list all configured workspaces
```

## Key rules

- Prefer `id` / `path` over `hpath` for stable addressing.
- Always `LIMIT` SQL queries; narrow scope with `root_id`, `box`, `type` first.
- Use `@file:` or `@stdin` for large text inputs (markdown, SQL, templates).
- Write operations support `--dry-run`; destructive actions require `--yes`.
- Always `siyuan workspace which` before writes to confirm the target.
- Errors go to stderr as JSON; stdout stays clean. Exit codes: 0=OK, 1=general, 2=config, 3=network, 4=auth, 5=permission.

## Bundled docs

Run `siyuan --help` to see the path to detailed reference docs covering:

- SiYuan block model, document path semantics, SQL query patterns, daily notes
- CLI command structure, input sources, config file format, permission rules

## Runtime values

- CLI version: `{{cli_version}}`
- Current workspace: `{{workspace}}`
- Base URL: `{{base_url}}`
- CLI path: `{{cli_path}}`
- Today: `{{today}}`

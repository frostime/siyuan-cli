---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
---

# SiYuan CLI

Agent-first CLI for SiYuan Note.

Start with:

```bash
siyuan --help
siyuan doc list
siyuan doc read extension.md   # when the task involves custom extensions
```

Use the real docs paths disclosed by help output when your runtime can read files directly. `siyuan doc` is convenience sugar for discovery and reading.

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
# Direct URL (local or remote)
siyuan workspace add main --url http://127.0.0.1:6806 --token <token>

# Or: auto-discover port from workspace directory (local only)
siyuan workspace add devspace --workspace-dir /path/to/SiYuanDevSpace --token <token>

siyuan workspace verify main
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
```

## Common commands

```bash
# Discovery
siyuan doc list                      # built-in docs with real file paths
siyuan api list                      # all endpoints
siyuan api <id> --help               # endpoint parameters and examples
siyuan tool list                     # all tools

# Query
siyuan api query.sql "SELECT id, content FROM blocks WHERE type='h' AND root_id='<doc-id>' LIMIT 20"

# Resolve path
siyuan tool resolve-path --hpath "/private/diary"

# Append content
siyuan tool append-content --targetId <id> --targetType document --markdown @file:./note.md

# Document tree
siyuan tool list-doc-tree --notebook <notebook-id>

# Extensions
siyuan extension --help              # entry point: layout + workflow
siyuan extension init                # scaffold extension directory
siyuan extension cache               # batch-generate schema.json caches
siyuan extension list                # discovered extensions + cache status
siyuan api|tool describe <id>        # confirm CLI recognized an extension contract
siyuan tool hello-ext --name Alice   # example: run a user-defined tool extension

# Workspace
siyuan workspace add <name> --workspace-dir <path> --token <t>  # auto-discover port by directory
siyuan workspace which               # show current resolution
siyuan workspace list                # list all configured workspaces
siyuan workspace verify <name>       # test connection
siyuan workspace show <name>         # show details + resolved baseUrl
```

## Key rules

- Prefer `id` / `path` over `hpath` for stable addressing.
- Always `LIMIT` SQL queries; narrow scope with `root_id`, `box`, `type` first.
- Use `@file:` or `@stdin` for large text inputs (markdown, SQL, templates).
- Write operations support `--dry-run`; destructive actions require `--yes`.
- Always `siyuan workspace which` before writes to confirm the target.
- Errors go to stderr as JSON; stdout stays clean. Exit codes: 0=OK, 1=general, 2=config, 3=network, 4=auth, 5=permission.

## Source bootstrapping

Built-in docs and runtime code ship in the same installed package. Use `siyuan doc list` to discover the real docs root, then inspect the sibling `dist/` directory when you need to understand internal behavior, discover unlisted capabilities, or verify implementation details.

Key runtime files:

| File | What to read it for |
|------|--------------------|
| `dist/shared/schema.d.mts` | `EndpointSchema`, `ToolSchema`, `ToolContext`, `GlobalArgs` declarations |
| `dist/shared/client.mjs` | `SiyuanClient.call(endpoint, payload)` — the raw HTTP client |
| `dist/api/registry.mjs` | How endpoints are registered and looked up |
| `dist/tool/registry.mjs` | How `ToolContext` is assembled (includes `callEndpoint`, `callEndpointRaw`) |

GitHub fallback:
- siyuan-cli: https://github.com/frostime/siyuan-cli
- SiYuan kernel API list: https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go

## Bundled docs

Use the disclosed docs root to read built-in files directly.

Recommended reading order:

1. `README.md`
2. `recipes/*.md`
3. `siyuan-guide/*.md`
4. `cli-usage/*.md`
5. `extension.md` — if you need to write custom extensions


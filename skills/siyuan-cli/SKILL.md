---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base."
metadata:
  version: "{{VERSION}}"
---

# SiYuan CLI

Agent-first CLI for SiYuan Note.

## Bootstrap (MUST follow this order on first use)

1. **Verify CLI is installed.** If `siyuan` is not found:
   `npm install -g @frostime/siyuan-cli`

2. **Check version.** If `SKILL.metadata.version != siyuan --version`, re-install skill:
   `siyuan skill install`

3. **Discover CLI builit-in docs root and command tree:**
   ```bash
   siyuan --help          # prints docs root path + full command tree
   siyuan doc list         # lists built-in docs with real file paths
   ```

4. **Check workspace connectivity:**
   ```bash
   siyuan workspace list
   siyuan workspace which
   ```
   If no workspace is configured, read `recipes/connect-workspace.md`.

## Task dispatch

Route by user intent — read the matching doc, don't guess:

| User wants to… | Read first | Key command |
|---|---|---|
| Find a document or block | `recipes/find-target.md` | `siyuan tool resolve-path`, `siyuan api query.sql` |
| Read content | `recipes/read-content.md` | `siyuan tool get-block-content` |
| Edit or append content | `recipes/edit-content.md` | `siyuan api block.updateBlock`, `siyuan tool append-content` |
| Query with SQL | `siyuan-guide/sql-query-guide.md` | `siyuan api query.sql` |
| Work with daily notes | `siyuan-guide/dailynote-model.md` | `siyuan tool list-dailynote`, `siyuan tool append-content` |
| Understand block model | `siyuan-guide/siyuan-block.md` | — |
| Understand paths | `siyuan-guide/document-tree-and-paths.md` | — |
| Write extensions | `cli-usage/extension.md` | `siyuan extension init` |
| Configure workspace | `cli-usage/workspace-config.md` | `siyuan workspace add` |

Resolve doc paths against the docs root disclosed by `siyuan --help`.
Use `siyuan doc list` to get absolute paths on the current system.

Current bundled documents:

```
<siyuan-cli-doc-dir>/
├── cli-usage/
│   ├── cli-overview.md
│   ├── extension.md
│   ├── permission.md
│   └── workspace-config.md
├── recipes/
│   ├── connect-workspace.md
│   ├── edit-content.md
│   ├── find-target.md
│   └── read-content.md
├── siyuan-guide/
│   ├── dailynote-model.md
│   ├── document-tree-and-paths.md
│   ├── siyuan-block.md
│   └── sql-query-guide.md
└── README.md
```

## Domain cheat sheet

High-frequency knowledge that docs cover in depth — inlined here to reduce round-trips.

**Block model**:
- Block is the primary data entity; a document is a container block (`type='d'`)
- `id` = stable primary key; `parent_id` = direct parent; `root_id` = owning document
- `box` = notebook id; `path` = id-based doc path (stable); `hpath` = human-readable doc path (unstable, changes on rename)
- `path` and `hpath` on non-document blocks describe the **containing document**, not the block itself
- `content` = plain text (for search); `markdown` = full source (for format preservation)
- Block reference: `((<BlockId> "anchor text"))`; block link: `[text](siyuan://blocks/<BlockId>)`
- Custom attributes use `custom-` prefix (e.g. `custom-dailynote-20240101`)

**SQL (read-only, five tables)**:
- `blocks` — primary content; `refs` — reference relationships; `attributes` — metadata; `assets` — resource files; `spans` — inline elements
- Always `LIMIT`; narrow scope with `root_id`, `box`, `type` before fuzzy `LIKE`
- Text search → `content`; format preservation → `markdown`; tree structure → `parent_id`; document scope → `root_id`
- Daily notes: `JOIN attributes A ON B.id = A.block_id WHERE A.name LIKE 'custom-dailynote-%'`

**Path semantics**:
- Stable addressing priority: `id` > `root_id` > `path`; never rely on `hpath` as key
- `parent_id` answers block hierarchy; `root_id` answers document membership; `path`/`hpath` answer document location — don't mix these

## Gotchas

- **MSYS / Git Bash path rewrite**: leading `/` in arguments gets rewritten. Prefer `MSYS_NO_PATHCONV=1 siyuan ...`; `//path` is a fallback.
- **`@stdin` is single-use**: one `@stdin` per invocation. Use `@file:` when multiple fields need long input.
- **Shell heredoc for inline SQL/markdown**:
  ```bash
  siyuan api query.sql --stmt @stdin <<'EOF'
  SELECT id, content FROM blocks WHERE ...
  EOF
  ```
- **Write safety**: `--dry-run` to preview; `--yes` to bypass approval when allowed. Always `siyuan workspace which` before writes.
- **Error handling**: stderr = JSON, stdout = clean data. Exit codes: 0=OK, 1=general, 2=config, 3=network, 4=auth, 5=permission.

## Foundation note

This SKILL covers siyuan-cli usage only. It does not cover specific workflows built on it.
For task-specific needs, create separate SKILLs that use siyuan-cli as the underlying tool.

## Source bootstrapping

When you need to understand internal behavior or discover unlisted capabilities, use `siyuan doc list` to find the docs root, then inspect the sibling `dist/` directory.

| File | What to read it for |
|------|--------------------|
| `dist/shared/schema.d.mts` | `EndpointSchema`, `ToolSchema`, `ToolContext`, `GlobalArgs` |
| `dist/shared/client.mjs` | `SiyuanClient.call(endpoint, payload)` — raw HTTP client |
| `dist/api/registry.mjs` | Endpoint registration and lookup |
| `dist/tool/registry.mjs` | `ToolContext` assembly (`callEndpoint`, `callEndpointRaw`) |

GitHub: [siyuan-cli](https://github.com/frostime/siyuan-cli) · [SiYuan kernel API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)

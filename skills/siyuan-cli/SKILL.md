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

3. **Discover CLI built-in docs root and command tree:**
   ```bash
   siyuan --help          # prints docs root path + full command tree
   siyuan doc list        # lists built-in docs with real file paths
   ```

4. **Check workspace connectivity:**
   ```bash
   siyuan workspace list
   siyuan workspace which
   ```
   If no workspace is configured, read `recipes/connect-workspace.md`.

Resolve doc paths against the docs root disclosed by `siyuan --help`.
Use `siyuan doc list` to get absolute paths on the current system.

## Mode selection

Choose the operating mode before choosing commands.

| Mode | Use when | Behavior |
|---|---|---|
| Fast thinking | Read/list/search, or create/append with an explicit target | Use the shortcut command, keep output bounded, verify only what the task needs |
| Slow thinking | Editing existing content; delete/move/rename/reorder/overwrite; batch changes; ambiguous target | Inspect first, choose an edit strategy, preview/confirm when possible, read back after writing |

## Fast thinking shortcuts

| Intent | Default command | Notes |
|---|---|---|
| Confirm target workspace | `siyuan workspace which` | MUST run before writes |
| List notebooks | `siyuan api notebook.lsNotebooks` | Use notebook id for stable targeting |
| Browse document tree | `siyuan tool list-doc-tree <notebook-or-doc-id> --depth 2` | Increase depth only when needed |
| List daily notes | `siyuan tool list-dailynote --atDate yyyy-MM-dd` | Add `--notebookId <id>` when known |
| Locate document/block | `siyuan tool resolve-path --hpath "/path"` | If ambiguous, read `recipes/find-target.md` |
| Read block metadata | `siyuan tool get-block-info <id>` | Shows type/path/breadcrumb/TOC |
| Read content | `siyuan tool get-block-content <id>` | Add `--showId true` when preparing edits |
| Read exact Kramdown | `siyuan api block.getBlockKramdown --id <id>` | Useful for one block or format-sensitive reads |
| Keyword search | `siyuan api search.fullTextSearchBlock "keyword"` | Prefer this for user keyword search |
| Create document | `siyuan api filetree.createDocWithMd --notebook <id> --path "/path/doc.sy" --markdown @stdin` | Prefer heredoc/stdin for long markdown |
| Import local Markdown | `siyuan tool push-md ./note.md --notebook <id> --toPath /parent` | Create mode is default; overwrite is slow path |
| Append content | `siyuan tool append-content --targetId <id> --targetType document --markdown @stdin` | Also supports `block` and `dailynote` |

### Common pattern: heredoc for long markdown

```bash
# Create
siyuan api filetree.createDocWithMd \
  --notebook <id> --path "/path/doc.sy" --markdown @stdin <<'EOF'
# Title
...
EOF

# Append
siyuan tool append-content \
  --targetId <id> --targetType document --markdown "You should use SiYuan in right matter"
```

## Slow thinking protocol

Use this for editing existing state or when the target/effect is unclear.

1. **Classify effect**: update existing, delete, move, rename, reorder, overwrite, or batch.
2. **Stabilize target**: identify workspace, notebook, document id, block id, and whether the target is a document block (`type='d'`).
3. **Inspect before writing**:
   ```bash
   siyuan workspace which
   siyuan tool get-block-info <id>
   siyuan tool get-block-content <id> --showId true
   ```
4. **Choose write path**:
   - Whole-document text replacement with safety checks → `siyuan tool brute-edit ... --dry-run`
   - Single block update → `siyuan api block.updateBlock --id <id> --dataType markdown --data @stdin`
   - Multiple block updates → `siyuan api block.batchUpdateBlock --blocks @file:./blocks.json`
   - Insert/append/prepend without changing existing blocks → `append-content` or `block.appendBlock` / `block.insertBlock`
   - Delete a document → `siyuan api filetree.removeDocByID --id <id>` (prefer this over `block.deleteBlock`; the latter may not fully remove document trees)
5. **Verify**: read back the changed block/document and check no unexpected sibling content changed.

### Batch update rule

Use `block.batchUpdateBlock` for multi-block edits. Default every item to `"dataType": "markdown"`; use `"dom"` only when DOM-level editing is explicitly required.

```json
[
  { "id": "20230315180000-abcdefg", "data": "New markdown", "dataType": "markdown" },
  { "id": "20230315180100-hijklmn", "data": "Another block", "dataType": "markdown" }
]
```

```bash
siyuan api block.batchUpdateBlock --blocks @file:./blocks.json
```

Caution: when updating a document block (`type='d'` / `NodeDocument`), this API deletes the document's existing child blocks and appends the new content. Treat document-block updates as slow path and verify references/attributes before proceeding.

## Builtin Document Reading

When the fast/slow shortcuts are insufficient, run `siyuan doc list` to see the current doc inventory.
Key docs by topic area:
- **Read / find / edit**: `recipes/read-content.md`, `recipes/find-target.md`, `recipes/edit-content.md`
- **Domain knowledge**: `siyuan-guide/siyuan-block.md`, `siyuan-guide/document-tree-and-paths.md`, `siyuan-guide/sql-query-guide.md`
- **Daily notes**: `siyuan-guide/dailynote-model.md`
- **Configuration**: `cli-usage/workspace-config.md`, `cli-usage/permission.md`
- **CLI details**: `cli-usage/cli-overview.md`
- **Extension authoring**: `cli-usage/extension.md`

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
- Block is the primary data entity; a document is a container block (`type='d'`).
- `id` = stable primary key; `parent_id` = direct parent; `root_id` = owning document.
- `box` = notebook id; `path` = id-based doc path (stable); `hpath` = human-readable doc path (unstable, changes on rename).
- `path` and `hpath` on non-document blocks describe the containing document, not the block itself.
- `content` = plain text for search; `markdown` / Kramdown = source representation.
- Block reference: `((<BlockId> "anchor text"))`; block link: `[text](siyuan://blocks/<BlockId>)`.
- Custom attributes use `custom-` prefix (e.g. `custom-dailynote-20240101`).

**Path semantics**:
- Stable addressing priority: `id` > `root_id` > `path`; avoid relying on `hpath` as a key.
- `parent_id` answers block hierarchy; `root_id` answers document membership; `path`/`hpath` answer document location.

**SQL**:
- Tables: `blocks`, `refs`, `attributes`, `assets`, `spans`.
- Use SQL for scoped inspection, metadata joins, and cases no built-in tool covers.
- Always `LIMIT`; narrow scope with `root_id`, `box`, `type` before fuzzy `LIKE`.
- Text search → `content`; format preservation → `markdown`; tree structure → `parent_id`; document scope → `root_id`.

## Gotchas

- **MSYS / Git Bash path rewrite**: leading `/` in arguments gets rewritten. Prefer `MSYS_NO_PATHCONV=1 siyuan ...`; `//path` is a fallback.
- **`@stdin` is single-use**: one `@stdin` per invocation. Use `@file:` when multiple fields need long input.
- **Shell heredoc for inline SQL/markdown**:
  ```bash
  siyuan api query.sql --stmt @stdin <<'EOF'
  SELECT id, content FROM blocks WHERE ... LIMIT 20
  EOF
  ```
- **Write safety**: `--dry-run` to preview when supported; `--yes` to bypass approval when allowed. Always `siyuan workspace which` before writes.
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

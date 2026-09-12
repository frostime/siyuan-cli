---
title: SiYuan Block Model
slug: siyuan-block
summary: Block as primary data entity, block types, container vs leaf, attributes, Markdown syntax extensions, and CLI/API mapping for block operations.
---

# SiYuan Block Model

SiYuan is a **block-centric database** with Markdown as representation, SQL as query language, and path fields as location metadata. The block — not the document — is the primary data entity.

## 1. Block fields

| Field | Role |
|-------|------|
| `id` | Stable primary key |
| `parent_id` | Direct parent block |
| `root_id` | Owning document block |
| `box` | Notebook ID |
| `path` | ID-based path of containing document |
| `hpath` | Human-readable path of containing document |
| `type` / `subtype` | Block type and subtype |
| `content` | Plain text (Markdown stripped) |
| `markdown` | Full Markdown source |
| `ial` | Inline attribute list |
| `created` / `updated` | Timestamps |

### Ownership versus location

Three relationships are easy to conflate:

| Question | Fields |
|---|---|
| Who is my direct parent? | `parent_id` |
| Which document owns me? | `root_id` (and `box` for the notebook) |
| Where does that document sit? | `path`, `hpath` |

**`path` and `hpath` on any block describe its containing document, not the block itself.** Every block in one document shares them, so neither can address a block. Hierarchy comes from `parent_id`; ownership from `root_id`.

| | `path` | `hpath` |
|---|---|---|
| Format | ID-based, `.sy` suffix | Title-based |
| Example | `/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy` | `/SiYuan Development/Document Structure` |
| Stability | stable within a notebook | changes on rename, and duplicates are possible |
| Use for | automation, permission rules | display to the user |

Addressing priority is **`id` > `root_id` > `path`**. Never use `hpath` or a title as a stable key.

A document block satisfies `type='d'`, `root_id = id`, and empty `parent_id`; its `path` points at its own `.sy` file:

```text
/data/20260101215354-j0c5gvk/20260107143325-zbrtqup/20260107143334-l5eqs5i.sy
      └── box (notebook) ──┘ └── parent doc ─────┘ └── this doc ──────────┘
```

Resolve between the two forms with `filetree.getIDsByHPath --notebook <id> --path "/..."`, `filetree.getHPathByID --id <id>`, or `filetree.getPathByID --id <id>`. On Git Bash/MSYS a leading `/` may be rewritten — use `MSYS_NO_PATHCONV=1` or the `//path` form. Browse structure with `tool list-doc-tree --entry <notebook-or-doc-id> --depth <n>`.

## 2. Block types

| type | subtype | Category | Description |
|------|---------|----------|-------------|
| `d` | — | container | Document (root of block tree; `root_id = id`) |
| `h` | `h1`–`h6` | leaf | Heading |
| `p` | — | leaf | Paragraph |
| `l` | `o` / `u` / `t` | container | List (ordered / unordered / task) |
| `i` | — | container | List item |
| `b` | — | container | Blockquote |
| `s` | — | container | Super block |
| `c` | — | leaf | Code block |
| `m` | — | leaf | Math block |
| `t` | — | leaf | Table |
| `query_embed` | — | leaf | Embed block |
| `html` | — | leaf | HTML block |
| `iframe` | — | leaf | IFrame block |
| `widget` | — | leaf | Widget block |
| `audio` | — | leaf | Audio |
| `video` | — | leaf | Video |
| `tb` | — | leaf | Thematic break |
| `av` | — | leaf | Attribute view |

> Newer SiYuan versions may add types. Do not hard-code this set as exhaustive.

Container blocks hold child blocks; leaf blocks do not.

## 3. Blocks and Markdown

Markdown is the representation layer, not the data model.

| Purpose | Prefer |
|---------|--------|
| Search, classify, rank | `content` |
| Edit, export, format fidelity | `markdown` |
| Hierarchy, ownership, scope | `parent_id`, `root_id`, `path` |
| Stable reference | `id` |

Some SiYuan features (block refs, embed queries, IAL) extend standard Markdown — they exist as block-model constructs, not native Markdown.

## 4. Block-level Markdown syntax

### Block link

```md
[display text](siyuan://blocks/<BlockId>)
```

### Block reference

```md
((<BlockId> "anchor text"))
((<BlockId> 'anchor text'))
```

### Embed block / query block

A `SELECT` statement wrapped in `{{}}`, or JS starting with a `//!js` shebang that returns a block-id array. The JS form executes in SiYuan's editor (it receives `protyle`/`Query` there), so the CLI can only write it, never test it.

**The content must occupy one line.** A `{{...}}` containing real newlines stays a plain paragraph (`type='p'`) instead of becoming `query_embed`. Encode every internal line break as the literal token `_esc_newline_`:

```md
{{SELECT * FROM blocks_esc_newline_WHERE type='d'_esc_newline_LIMIT 5}}
```

```md
{{//!js_esc_newline_const search = async () => ['20260512171313-c5johcu'];_esc_newline_return search()}}
```

The token is stored verbatim in `blocks.markdown`, so reads return it unchanged. Do not "clean it up" into newlines when round-tripping an existing embed block — that converts the block to a paragraph and stops the query from running.


### Tag

```md
#tag#
```

## 5. Block attributes

### Two storage locations

**`blocks.ial`** — inline attribute list on the block record:

```text
{: id="20210104091228-d0rzbmm" updated="20210604222535"}
```

**`attributes` table** — separate key-value store:

| Field | Role |
|-------|------|
| `block_id` | Owning block |
| `name` | Attribute name |
| `value` | Attribute value |

### Custom attributes

Must use `custom-` prefix: `custom-project`, `custom-status`, `custom-source`.

### Common system attributes

| Attribute | Meaning |
|-----------|---------|
| `custom-dailynote-YYYYMMDD` | Daily note marker |
| `custom-hidden` | Hidden in doc tree |
| `custom-sy-readonly` | Read-only |
| `custom-sy-fullwidth` | Full-width layout |
| `custom-avs` | Linked attribute-view IDs |

## 6. CLI quick reference

**Read**: `get-block-content <id>` · `get-block-info <id>` (docs include outgoing refs) · `search-backlinks <target-id>` · `locate-block "%p%"` · `get-block-content <id> --range children --limit=-1` (full doc) · exact Kramdown: `block.getBlockKramdown --id <id>`
Prefer `tool` over raw API for reading. Kramdown/BlockDOM rarely needed.

**Write**: `block.appendBlock` · `tool update-block` (preserves custom attrs) · `block.insertBlock` · `block.moveBlock` · `block.deleteBlock` · `checkpoint-doc <doc-id>` (kernel history + local recovery package) · `brute-edit --check→dry-run→yes`
**Attr**: `attr.getBlockAttrs` / `attr.setBlockAttrs` (batch variants available)
Full params: `<cmd> --help`; write workflows → `recipes/edit-content.md`.

**Gotchas**:
- Raw `updateBlock`/`batchUpdateBlock` erases all `custom-*` attributes. Use `tool update-block`.
- `updateBlock` on document block (`type='d'`) replaces the child tree. Use `brute-edit` for document rewrites.
- `transferBlockRef` triggers full kernel reindex; standalone action only.

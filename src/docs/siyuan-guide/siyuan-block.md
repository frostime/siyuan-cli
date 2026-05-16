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

- An select SQL code wrapped with `{{}}`, MUST be oneline, `\n` -> `__newline__`.

```md
{{SELECT * FROM blocks WHERE _esc_newline_ type='d' LIMIT 5}}
```

- An js code, startwith `//!js` shebang, return BlockID array.

```md
{{//!js_esc_newline_const search = async () =&gt; ['20260512171313-c5johcu']_esc_newline_return search()}}
```


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

**Read**: `get-block-content <id>` · `get-block-info <id>` · `locate-block "%p%"` · `get-block-content <id> --range children --limit=-1` (full doc) · `checkpoint-doc <doc-id>` · exact Kramdown: `block.getBlockKramdown --id <id>`
Prefer `tool` over raw API for reading. Kramdown/BlockDOM rarely needed.

**Write**: `block.appendBlock` · `tool update-block` (preserves custom attrs) · `block.insertBlock` · `block.moveBlock` · `block.deleteBlock` · `brute-edit --check→dry-run→yes`
**Attr**: `attr.getBlockAttrs` / `attr.setBlockAttrs` (batch variants available)
Full params: `<cmd> --help`; write workflows → `recipes/edit-content.md`.

**Gotchas**:
- Raw `updateBlock`/`batchUpdateBlock` erases all `custom-*` attributes. Use `tool update-block`.
- `updateBlock` on document block (`type='d'`) replaces the child tree. Use `brute-edit` for document rewrites.
- `transferBlockRef` triggers full kernel reindex; standalone action only.

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

## 6. CLI tool & API mapping

Inspect with a read command before writing.

### Read

| Task | Tool | Raw API fallback |
|------|------|------------------|
| Block Markdown | `siyuan tool get-block-content <id>` | — |
| Block metadata | `siyuan tool get-block-info <id>` | `block.getBlockInfo` |
| Search by pattern | `siyuan tool locate-block "%p%"` | `search.fullTextSearchBlock` |
| Exact Kramdown (update prep) | — | `siyuan api block.getBlockKramdown --id <id>` |
| Batch Kramdown / doc info | — | `block.getBlockKramdowns` / `block.getDocsInfo` |
| Block DOM | — | `block.getBlockDOM` |

Prefer `tool` for reading; accessing Kramdown is usually unnecessary. SHOULD NOT read BlockDOM.

### Write

| Task | Command |
|------|---------|
| Update block | `siyuan api block.updateBlock --id <id> --data "## New heading" --dataType markdown` |
| Append children | `siyuan api block.appendBlock --parentID <id> --data "paragraph"` |
| Batch append | `siyuan api block.batchAppendBlock --blocks @file:./blocks.json` |
| Prepend children | `siyuan api block.prependBlock --parentID <id> --data "paragraph" --dataType markdown` |
| Batch prepend | `siyuan api block.batchPrependBlock --blocks @file:./blocks.json` |
| Insert before/after/child | `siyuan api block.insertBlock --previousID <id> --data "..." --dataType markdown` |
| Batch insert | `siyuan api block.batchInsertBlock --blocks @file:./blocks.json` |
| Delete block | `siyuan api block.deleteBlock --id <id>` |
| Move block | `siyuan api block.moveBlock --id <id> --previousID <target-id> --parentID <parent-id>` |
| Transfer block ref | `siyuan api block.transferBlockRef --id <id> --fromID <source> --toID <target>` |

> ⚠️ `transferBlockRef` rewrites all references from one block to another and triggers a full kernel reindex. Use only as a deliberate standalone action.

### Attributes

| Task | Command |
|------|---------|
| Get attrs | `siyuan api attr.getBlockAttrs --id <id>` |
| Batch get attrs | `siyuan api attr.batchGetBlockAttrs --ids '["<id1>","<id2>"]'` |
| Set attrs | `siyuan api attr.setBlockAttrs --id <id> --attrs '{"custom-key":"value"}'` |
| Batch set attrs | `siyuan api attr.batchSetBlockAttrs --blockAttrs '[{"id":"<id>","attrs":{"custom-key":"value"}}]'` |

For multiple known IDs, prefer batch endpoints over per-id loops. All commands support `--help`. Use `--dry-run` to preview writes.

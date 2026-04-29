---
title: SiYuan Block Model
slug: siyuan-block
summary: Explain SiYuan block as the primary data model, its relation to Markdown, block types, container vs leaf blocks, attributes, and block-specific syntax.
---

# SiYuan Block Model

In SiYuan, **the block is the primary data entity**.

For an agent, the most important shift is to stop treating SiYuan as a collection of Markdown files and instead model it as:

- a **block model layer**, where content is stored, addressed, referenced, and queried by block
- a **Markdown representation layer**, where many blocks can be expressed or exported as Markdown
- a **query layer**, where SQL can retrieve blocks, references, attributes, and related metadata
- a **location layer**, where `id`, `root_id`, `path`, `hpath`, and `box` identify context

## 1. What a block is

A block usually has these key fields:

- `id`: the stable primary key of the block
- `parent_id`: the direct parent block ID
- `root_id`: the document block ID that owns this block
- `box`: the notebook ID
- `path`: the ID-based path of the containing document
- `hpath`: the human-readable path of the containing document
- `type` / `subtype`: block type and subtype
- `content`: plain text with Markdown formatting removed
- `markdown`: full Markdown source
- `ial`: inline attribute list
- `created` / `updated`: creation and update timestamps

### Agent mental model

A practical way to think about SiYuan is:

- a document is a special container block
- headings, paragraphs, lists, code blocks, and tables inside a document are also blocks
- references, attributes, assets, and inline elements are all organized around blocks

In other words, **a document is the root of a block tree, not the only thing worth operating on**.

## 2. The relationship between blocks and Markdown

### Core conclusion

**The block is the data model. Markdown is the representation format.**

Markdown is important in SiYuan, but an agent should not treat it as the only source of truth, because:

- the same block exposes both `content` and `markdown`
- `content` is better for search, summarization, and keyword matching
- `markdown` is better for format preservation, reconstruction, and precise editing
- some SiYuan features are not native parts of standard Markdown, but extensions built on top of the block system

### Recommended interpretation

- for search, classification, and ranking: prefer `content`
- for rewriting, exporting, and high-fidelity rendering: prefer `markdown`
- for hierarchy, ownership, and scope: prefer `parent_id`, `root_id`, and `path`
- for stable references: prefer `id`

## 3. Leaf blocks and container blocks

### Container blocks

Container blocks can contain child blocks. Common examples include:

- `d`: document
- `b`: blockquote
- `l`: list
- `i`: list item
- `s`: super block

### Leaf blocks

Leaf blocks usually do not contain child blocks. Common examples include:

- `p`: paragraph
- `h`: heading
- `c`: code block
- `m`: math block
- `t`: table
- `query_embed`: embed block
- `html`: HTML block
- `iframe`: IFrame block
- `widget`: widget block
- `audio` / `video`: audio and video blocks
- `tb`: thematic break
- `av`: attribute view

## 4. Common block types

Common block types and subtypes include:

- `d`: Document
- `h`: Heading
  - `h1` ~ `h6`
- `p`: Paragraph
- `l`: List
  - `o`: Ordered list
  - `u`: Unordered list
  - `t`: Task list
- `i`: ListItem
- `c`: Code block
- `m`: Math block
- `t`: Table
- `b`: Blockquote
- `s`: Super block
- `query_embed`: Embed
- `widget`: Widget
- `iframe`: IFrame
- `audio` / `video`
- `tb`: Thematic break

> Version note: newer SiYuan versions may introduce additional block types or extended variants. An agent should not hard-code the type set as if it were permanently fixed.

## 5. Block-level Markdown syntax

SiYuan uses Markdown, but extends it with several **block-related syntaxes**.

### Block link

Used to jump to a block:

```md
[display text](siyuan://blocks/<BlockId>)
```

### Block reference

Used to dynamically reference another block:

```md
((<BlockId> "anchor text"))
((<BlockId> 'anchor text'))
```

### Embed block / query block

Used for dynamic SQL embedding:

```md
{{SELECT * FROM blocks WHERE type='d' LIMIT 5}}
```

### Tag

```md
#tag#
```

## 6. Block attributes

### Two different kinds of attributes

#### 6.1 `blocks.ial`

This is the inline attribute list stored on the block itself, for example:

```text
{: id="20210104091228-d0rzbmm" updated="20210604222535"}
```

It is closer to a source-level attribute expression attached to the block.

#### 6.2 The `attributes` table

This is a separate block-attribute table used to store attribute key-value pairs.

For example:

- `block_id`: which block owns the attribute
- `name`: attribute name
- `value`: attribute value

### Custom attributes

Custom attributes should consistently use the `custom-` prefix, for example:

- `custom-project`
- `custom-status`
- `custom-source`

### Common system-level attributes

The most useful ones for agents include:

- `custom-dailynote-YYYYMMDD`: daily note marker
- `custom-hidden`: whether the document is hidden in the document tree
- `custom-sy-readonly`: read-only marker
- `custom-sy-fullwidth`: full-width layout preference
- `custom-avs`: linked attribute-view ID list

## 7. Agent operation rules

### 7.1 Priority for stable addressing

For stable addressing, prefer:

1. `id`
2. `root_id`
3. `path`

Do not prefer:

- document titles
- `hpath`
- visually readable names alone

Those are better for presentation, not for stability.

### 7.2 For user-facing output

Prefer to show:

- `hpath`
- the title or `content`
- a block link when needed

### 7.3 Field selection during queries

- filter by document scope: `root_id`
- filter by parent-child hierarchy: `parent_id`
- filter by notebook: `box`
- search text: `content`
- preserve formatting: `markdown`
- filter by metadata: `attributes`

### 7.4 Citing SiYuan content in answers

If an agent needs to provide the user with a clickable source, prefer a block link:

```md
[anchor text](siyuan://blocks/<BlockId>)
```

This is more stable than returning only a title or a plain path.

### 7.5 CLI tool & API mapping

The following commands cover common block operations. Always inspect with a read command before writing.

#### Read

| Task | Command |
|------|---------|
| Read block markdown (full fidelity) | `siyuan tool get-block-content <id>` |
| Read block markdown with id annotations | `siyuan tool get-block-content <id> --showId true` |
| Inspect block metadata | `siyuan tool get-block-info <id>` |
| Get raw block info from kernel | `siyuan api block.getBlockInfo --id <id>` |
| Get Kramdown (kernel internal format) | `siyuan api block.getBlockKramdown --id <id>` |
| Get block DOM | `siyuan api block.getBlockDOM --id <id>` |
| Get breadcrumb path | `siyuan api block.getBlockBreadcrumb --id <id>` |
| List child blocks | `siyuan api block.getChildBlocks --id <id>` |

#### Write

| Task | Command |
|------|---------|
| Update block content | `siyuan api block.updateBlock --id <id> --data "## New heading" --dataType markdown` |
| Append child blocks | `siyuan api block.appendBlock --parentId <id> --data "paragraph" --dataType markdown` |
| Prepend child blocks | `siyuan api block.prependBlock --parentId <id> --data "paragraph" --dataType markdown` |
| Insert before/after/child | `siyuan api block.insertBlock --previousId <id> --data "..." --dataType markdown` |
| Delete block | `siyuan api block.deleteBlock --id <id>` |
| Move block | `siyuan api block.moveBlock --id <id> --previousId <target-id>` |
| Transfer block ref | `siyuan api block.transferBlockRef --id <id> --fromID <source> --toID <target>` |

#### Attributes

| Task | Command |
|------|---------|
| Get block attributes | `siyuan api attr.getBlockAttrs --id <id>` |
| Set block attributes | `siyuan api attr.setBlockAttrs --id <id> --attrs '{"custom-key":"value"}'` |

All commands support `--help` for full parameter details. Use `--dry-run` to preview writes.

## 8. One-sentence summary

For an agent, SiYuan should not be modeled as a Markdown filesystem. It should be modeled as a **block-centric database with Markdown as representation, SQL as query language, and path fields as location metadata**.

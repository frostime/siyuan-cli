---
title: SQL Query Guide
slug: sql-query-guide
summary: High-value SQL guidance for querying SiYuan blocks, refs, and attributes.
---

# SQL Query Guide

SiYuan stores note data in SQLite. The most important tables are:

- `blocks`
- `refs`
- `attributes`

Full reference:
- https://docs.siyuan-note.club/zh-Hans/reference/database/table.html
- SQL CheatSheet: https://ld246.com/article/1739546865001

## Core rule

Only `select *` SQL is supported by SiYuan.
If `LIMIT` is not explicitly specified, an default of `limit 64` will be taken by SiYuan backend.

## `blocks` table

Important fields:

| Field | Description | Example value |
|------|------|--------|
| `id` | Unique block ID | 20241016135347-zlrn2cz |
| `type` | Block type | d, h, p, l, c, t, m, b, s, av ... (see table below) |
| `subtype` | Subtype | h1-h6, u, o, t, NOTE, TIP, etc. (see table below) |
| `content` | Plain text content | Document title or block text |
| `markdown` | Markdown source | Full formatted content |
| `box` | Notebook ID | 20210808180117-czj9bvb |
| `root_id` | Root document ID | Same as the document block id |
| `path` | ID path | /20241020123921-0bdt86h/20240331203024-9vpgge9.sy |
| `hpath` | Name path | /Inbox/My Documents |
| `created` | Creation time | 20241016135347 |
| `updated` | Update time | 20241016140000 |
| `ial` | Block inline attrubute list | {: id="20210104091228-d0rzbmm" updated="20210604222535"} |

### Type and Subtype values

- `d` Document
- `h` Heading
  - `h1`–`h6` Heading 1–6
- `p` Paragraph
- `l` List
  - `u` Unordered List
  - `o` Ordered List
  - `t` Task List
- `i` ListItem
- `c` Code
- `m` Math
- `t` Table
- `b` Blockquote
- `s` SuperBlock
- `html` HTML
- `query_embed` Embed
- `av` Attribute View
- `widget` Widget
- `iframe` IFrame
- `tb` Thematic Break
- `audio` Audio
- `video` Video
- `callout` Callout
  - `NOTE` Note
  - `TIP` Tip
  - `IMPORTANT` Important
  - `WARNING` Warning
  - `CAUTION` Caution

### Example queries

Find documents by keyword:

```sql
SELECT * FROM blocks
WHERE type='d' AND content LIKE '%keyword%'
LIMIT 32
```

Recent documents:

```sql
SELECT * FROM blocks
WHERE type='d'
ORDER BY updated DESC
LIMIT 10
```

Specific heading type:

```sql
SELECT * FROM blocks
WHERE type='h' AND subtype='h2'
  AND root_id='<document-id>'
LIMIT 32
```

## `refs` table

Tracks block-reference relationships.

| field | meaning |
|---|---|
| `block_id` | source block id |
| `def_block_id` | referenced block id |
| `def_block_root_id` | referenced block's document id |

### Backlink query

```sql
SELECT B.* FROM blocks AS B
WHERE B.id IN (
    SELECT block_id FROM refs WHERE def_block_id = '<target-block-id>'
)
LIMIT 32
```

## `attributes` table

Stores custom attributes.

| field | meaning |
|---|---|
| `block_id` | owner block id |
| `name` | attribute key |
| `value` | attribute value |

Custom keys usually use the `custom-` prefix.

### Query custom attributes

```sql
SELECT B.* FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name = 'custom-myattr'
  AND A.value = 'somevalue'
LIMIT 32
```

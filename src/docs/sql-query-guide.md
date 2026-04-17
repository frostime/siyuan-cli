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

## Core rule

Always add a `LIMIT` unless you explicitly need a full scan.

Recommended default:

```sql
LIMIT 32
```

## `blocks` table

Important fields:

| field | meaning |
|---|---|
| `id` | block id |
| `type` | block type |
| `subtype` | subtype, such as heading level |
| `content` | plain text content |
| `markdown` | markdown source |
| `box` | notebook id |
| `root_id` | document id |
| `path` | stable id-based path |
| `hpath` | human-readable path |
| `created` | created timestamp |
| `updated` | updated timestamp |

### Example queries

Find documents by keyword:

```sql
SELECT * FROM blocks
WHERE type='d' AND content LIKE '%关键词%'
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
  AND root_id='<文档ID>'
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
    SELECT block_id FROM refs WHERE def_block_id = '<目标块ID>'
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

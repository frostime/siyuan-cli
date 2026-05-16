---
title: Daily Note Model
slug: dailynote-model
summary: Explain how SiYuan daily notes are identified, created, and queried across notebooks.
---

# Daily Note Model

Each notebook can manage daily notes independently.

## Path template

Daily-note location is generated from a template, usually with Go-style date formatting.

Example:

```text
/daily note/{{now | date "2006/01"}}/{{now | date "2006-01-02"}}
```

For `2025-12-15`, this resolves to:

```text
/daily note/2025/12/2025-12-15
```

## Identification

Daily-note documents are marked by attributes like:

```text
custom-dailynote-20240101 = 20240101
```

So daily notes can be queried through the `attributes` table.

## Tool-level behavior

Recommended high-level operations:

- list daily notes by date or date range
- append content to today’s daily note
- create or get today’s daily note per notebook before writing

## Query pattern

```sql
SELECT DISTINCT B.*
FROM blocks AS B
JOIN attributes AS A ON B.id = A.block_id
WHERE A.name LIKE 'custom-dailynote-%'
  AND B.type = 'd'
  AND A.value >= '20231010'
  AND A.value <= '20231013'
ORDER BY A.value DESC
LIMIT 32
```

## Practical rule

Before operating on a daily note:
1. determine the notebook
2. create/get the target daily note for that notebook
3. append or inspect content

## CLI quick reference

**Tools**: `list-dailynote --atDate YYYY-MM-DD` · `list-dailynote --afterDate ... --beforeDate ...` · `--notebookId <id>` to scope · `block.appendDailyNoteBlock --notebook <id> --data "..."` (dataType defaults to `markdown`)

**Low-level**: `filetree.createDailyNote --notebook <id>` (idempotent, returns doc id) · `query.sql` with `attributes` table join (see `sql-query-guide.md`) · `attr.setBlockAttrs` for manual attribute assignment

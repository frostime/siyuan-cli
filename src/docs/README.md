---
title: SiYuan CLI Internal Docs
slug: internal-docs-index
summary: Curated internal reference documents for building reliable agents on top of SiYuan.
---

# Internal Docs Index

Recommended reading order:

1. `siyuan-block.md`
   - what a block is
   - the relationship between blocks and Markdown
   - container blocks vs leaf blocks
   - block attributes
   - block-level syntax
   - agent operation rules

2. `document-tree-and-paths.md`
   - `id` / `parent_id` / `root_id`
   - `box`
   - `path` vs `hpath`
   - the difference between the block tree and document file layout

3. `sql-query-guide.md`
   - `blocks`
   - `refs`
   - `attributes`
   - `assets`
   - `spans`
   - agent query strategy

4. `dailynote-model.md`
   - daily note path templates
   - daily note identification via attributes
   - date-range queries
   - notebook-level operation rules

## Suggested mental model

When building an agent on top of SiYuan, it is better to understand the system in four layers:

1. **Block model**
2. **Tree and path semantics**
3. **SQL query model**
4. **Feature-specific models** (for example, daily notes)

Do not reduce SiYuan to a generic Markdown folder structure.

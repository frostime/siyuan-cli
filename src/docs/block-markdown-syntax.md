---
title: Block Markdown Syntax
slug: block-markdown-syntax
summary: SiYuan-specific markdown syntax for block links, references, embeds, and answer citations.
---

# Block Markdown Syntax

SiYuan uses Markdown plus several block-specific syntaxes.

## Block link

Clickable jump:

```md
[display text](siyuan://blocks/<BlockId>)
```

## Block reference

Dynamic reference to another block:

```md
((<BlockId> "anchor text"))
((<BlockId> 'anchor text'))
```

## Block embed / query block

Dynamic SQL embed:

```md
{{SELECT * FROM blocks WHERE type='d' LIMIT 5}}
```

When SQL contains newlines, use `_esc_newline_` escaping.

## Tags

```md
#标签名#
```

## Recommendation for answers

When citing SiYuan content in agent responses, prefer block-link format:

```md
[锚文本](siyuan://blocks/<BlockId>)
```

This gives the user a stable path back to the source block.

---
name: siyuan-cli
description: "Manage SiYuan Note with the `siyuan` CLI. Use this whenever the user mentions SiYuan, 思源笔记, notebooks, documents, blocks, or wants to query/update a SiYuan knowledge base. Supports workspace management, direct kernel APIs, and higher-level tools."
---

# SiYuan CLI

Use the `siyuan` command to interact with the user's SiYuan kernel.

## Prerequisites

1. Check CLI exists: `siyuan --version`
2. Check workspace: `siyuan workspace list`
3. If needed, add one:

```bash
siyuan workspace add main --url http://127.0.0.1:6806 [--token <token>]
```

## Common commands

### Verify kernel
```bash
siyuan workspace verify main
siyuan api system.version
```

### Run SQL
```bash
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
```

### Resolve stable path
```bash
siyuan tool resolve-path --hpath "/私人/日记"
```

### Append markdown
```bash
siyuan tool append-content --targetId <doc-or-block-id> --targetType document --markdown @file:./note.md
```

## Help discovery

```bash
siyuan api list
siyuan api query.sql --help
siyuan tool list
siyuan tool list-doc-tree --help
```

## Notes

- Prefer stable `path` / `id` over hpath for automation.
- Prefer `@file:` or `@stdin` for large text inputs.
- Write actions support `--dry-run` where available.

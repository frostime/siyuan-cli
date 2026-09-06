---
title: SiYuan CLI Skill Resources
slug: skill-resources
summary: Agent-facing reference shipped with siyuan-cli. Start here when using `siyuan-cli skill read README.md`.
---

# SiYuan CLI Skill Resources

If you are an Agent with the installed `siyuan-cli` SKILL, read the SKILL first — it is the operational entry point with safety rules, hot-path commands, and routing. Use this page to choose the right skill resource when the SKILL routes you here or when you browse the skill directly.

## Quick start points

| Situation | Read |
|-----------|------|
| No workspace or connection failure | `recipes/connect-workspace.md` |
| User names a doc/block without giving an id | `recipes/find-target.md` |
| Need to read/inspect content | `recipes/read-content.md` |
| Need to edit, move, delete, create, or batch update | `recipes/edit-content.md` |
| Need block/path/sql domain model | `siyuan-guide/siyuan-block.md` |
| Need daily note operations | `siyuan-guide/dailynote-model.md` |
| Workspace selection and process binding | `cli-usage/current.md` |
| Permission denied or approval issues | `cli-usage/permission.md` |
| Writing custom API/tool extensions | `cli-usage/extension.md` |
| CLI flags, error codes, input sources | `cli-usage/cli-overview.md` |

## Directory structure

| Directory | Role | Read when |
|-----------|------|-----------|
| `recipes/` | Scenario playbooks | Bounded task with safety considerations |
| `siyuan-guide/` | SiYuan domain model | Understanding blocks, paths, SQL, daily notes |
| `cli-usage/` | CLI mechanics and configuration | Flags, config, permissions, extension authoring |

## Help discovery

```bash
siyuan-cli --help                    # command overview
siyuan-cli skill list                  # list skill resources with summaries
siyuan-cli skill read <path>           # read a doc by path or unique basename
siyuan-cli api list                  # all available endpoints
siyuan-cli api <id> --help           # endpoint parameters, input sources, examples
siyuan-cli tool list                 # all available tools
siyuan-cli tool <id> --help          # tool parameters, examples, behavior
```

## Skill resources

### Recipes (`recipes/`)

| File | Covers |
|------|--------|
| `connect-workspace.md` | Configure, verify, anchor, and recover workspace connections. |
| `find-target.md` | Resolve user-visible hints into stable document/block ids. |
| `read-content.md` | Read document/block content safely with bounded output and id awareness. |
| `edit-content.md` | Edit, create, move, delete content with strategy choice and verification. |

### SiYuan domain knowledge (`siyuan-guide/`)

| File | Covers |
|------|--------|
| `siyuan-block.md` | Block as primary data model, types, attributes, Markdown syntax extensions. |
| `document-tree-and-paths.md` | id / parent_id / root_id / box / path / hpath semantics. |
| `sql-query-guide.md` | Five core tables, query patterns, anti-patterns. |
| `dailynote-model.md` | Daily note path template, attribute marker, date range queries. |

### CLI usage and configuration (`cli-usage/`)

| File | Covers |
|------|--------|
| `cli-overview.md` | Command tree, global flags, input sources, error codes, debugging. |
| `current.md` | Effective workspace selection, process binding, verification, and selection errors. |
| `workspace-config.md` | Config file, workspace connections, token sources, behavior, permissions, and project anchoring. |
| `permission.md` | Permission rule syntax, evaluation, explicit approval, debugging. |
| `extension.md` | Custom API/tool extensions, schema authoring, permission schema coupling. |

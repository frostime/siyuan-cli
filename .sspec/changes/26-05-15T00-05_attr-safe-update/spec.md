---
name: attr-safe-update
status: PLANNING
change-type: single
created: 2026-05-15T00:05:23
reference: null
---

<!-- MUST follow frontmatter schema:
status: PLANNING | DOING | REVIEW | DONE | BLOCKED
change-type: single | sub
reference?: Array<{source, type: 'request'|'root-change'|'sub-change'|'prev-change'|'doc'|'revision', note?}>
-->

# attr-safe-update

## Problem Statement

SiYuan kernel `updateBlock` / `batchUpdateBlock` API erases all `custom-*` attributes on the target block. Current CLI docs and SKILL recommend these APIs as the standard edit path without warning. Agents using the CLI lose user data (custom attrs) on every block update.

## Proposed Solution

### Approach

New built-in tool `update-block` with one input format: `blocks` JSON array of `{id, data}`.

Flow: read custom attrs → batchUpdateBlock → write back custom attrs.

Always markdown. No DOM. No single/batch mode distinction — always an array (one element = single block). Input via `@file:` or `@stdin` (heredoc) to avoid shell escaping issues.

Why a tool instead of fixing the endpoint: the kernel behavior is upstream and intentional (IAL is part of the block DOM; markdown-mode update replaces it). A tool-level wrapper is the correct abstraction.

### Key Change

**Tool A: `update-block` built-in tool** — attr-safe block content update, single + batch mode.

**Docs B: Update agent-facing documentation** — Replace `block.updateBlock` / `block.batchUpdateBlock` recommendations with `siyuan tool update-block` in recipes, SKILL, and overview docs. Add warning about raw API attr loss.

### Scope Summary

| File | Change |
|------|--------|
| `src/tool/builtins/update-block.ts` | New tool implementation |
| `src/tool/builtins/index.ts` | Register new tool |
| `src/docs/recipes/edit-content.md` | Update strategy table + examples |
| `src/docs/cli-usage/cli-overview.md` | Update examples |
| `skills/siyuan-cli/SKILL.md` | Update recommended commands |

### Design Reference

→ See [design.md](./design.md)

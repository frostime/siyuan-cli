---
name: brute-edit-overwrite
status: REVIEW
change-type: single
created: 2026-05-12T22:59:16
reference:
  - source: "chat-thread-export.xml"
    type: "doc"
    note: "Previous session context and agreed tool-consolidation direction."
---

# brute-edit-overwrite

## Problem Statement

SiYuan CLI currently lacks a clean `write` analogue for replacing an existing document's whole Markdown content, causing Agents to use `push-md --overwrite`, which deletes and re-imports the document, changes the document ID, and has a non-atomic failure window.

## Proposed Solution

### Approach

Extend `brute-edit` from document-level search-and-replace into the document-level edit/write tool. Existing `--replacements` remains the `edit` analogue; new `--overwrite <markdown-source>` becomes the `write` analogue and uses the same safety checks before calling `block.updateBlock` on the document block.

Add `get-block-content --bodyOnly true` so Agents can safely dump document body Markdown to a local file without the CLI metadata header, edit it locally, then write it back through `brute-edit --overwrite @file:<path>`.

Remove `push-md` from built-in tools. New document creation/import remains available through kernel API wrappers (`filetree.createDocWithMd`, `import.importStdMd`), while existing-document overwrite is handled by `brute-edit --overwrite`.

### Key Change

**Feat A: Body-only reads**
- Add `bodyOnly` input to `get-block-content`.
- CLI flag is `--bodyOnly true`.
- Compact output contains only rendered body Markdown when enabled.

**Feat B: Brute-edit overwrite mode**
- Add `overwrite` string input to `brute-edit` with `literal | file | stdin` sources.
- `--overwrite` and `--replacements` are mutually exclusive.
- `--check true` remains an independent safety-only mode.
- Dry-run reports overwrite metadata without writing.
- Execution writes with `block.updateBlock` and preserves the document ID.

**Cleanup C: Remove push-md builtin**
- Stop registering `push-md` as a built-in tool.
- Remove its implementation/tests from active built-in surface.
- Replace docs/SKILL guidance with `brute-edit --overwrite`, `filetree.createDocWithMd`, and `import.importStdMd`.

### Scope Summary

| File | Change |
|------|--------|
| `src/tool/builtins/get-block-content.ts` | Add `bodyOnly` input and compact rendering branch |
| `src/tool/builtins/brute-edit.ts` | Add overwrite source mode, mutual exclusion, dry-run/apply logic |
| `src/tool/builtins/index.ts` | Remove `push-md` registration |
| `src/tool/builtins/push-md.ts` | Delete removed builtin implementation |
| `tests/tool-write-tools.test.ts` | Update source parsing tests; remove push-md-specific tests |
| `skills/siyuan-cli/SKILL.md` | Update safe write workflow |
| `src/docs/**` / `docs/blog/intro-blog.md` / `CHANGELOG.md` | Replace `push-md` guidance and document new workflow |

### Design Reference

Inline design is sufficient: this change modifies two existing tool interfaces and removes one redundant builtin; no new architecture or data model is introduced.

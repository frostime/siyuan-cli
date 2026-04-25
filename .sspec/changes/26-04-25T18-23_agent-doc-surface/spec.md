---
name: agent-doc-surface
status: PLANNING
change-type: single
created: 2026-04-25T18:23:58
reference: null
---

<!-- @RULE: Frontmatter
status: PLANNING | DOING | REVIEW | DONE | BLOCKED
change-type: single | sub
reference?: Array<{source, type: 'request'|'root-change'|'sub-change'|'prev-change'|'doc'|'revision', note?}>

Sub-change MUST link root:
reference:
  - source: ".sspec/changes/<root-change-dir>"
    type: "root-change"
    note: "Phase <n>: <phase-name>"

Single-change common reference:
reference:
  - source: ".sspec/requests/<request-file>.md"
    type: "request"
  - source: ".sspec/changes/<change-dir>"
    type: "prev-change"
    note: "Follow-up to <change-name>."
-->

# agent-doc-surface

## Problem Statement
Agent bootstrap currently depends on top-level help plus manually browsing shipped files, which causes multi-step discovery for common tasks and extra CLI surface for the single bundled skill.

The current docs package has strong reference material, but 0 task recipes and 0 built-in doc commands. The current skill UX also requires a redundant skill name even though only one bundled skill is shipped. These gaps reduce predictability for agents operating from installed CLI context.

## Proposed Solution

### Approach
Add a minimal docs discovery surface centered on real file paths, then keep the command sugar thin. The CLI will expose a new `siyuan doc` command with only `list` and `read`, and every related help/output surface will disclose the actual on-disk docs path so agents can directly read files without routing through CLI output.

Add four end-to-end recipe docs under `src/docs/recipes/` to cover the main agent workflow: connect, find, read, edit. Keep document metadata minimal with only `title` and `summary`. In parallel, simplify `siyuan skill` to `install`, `read`, and `uninstall`, with `install` acting as install-or-update and defaulting to the single bundled skill.

### Key Change
**Docs A: Minimal task recipes**
Add `recipes/connect-workspace.md`, `recipes/find-target.md`, `recipes/read-content.md`, and `recipes/edit-content.md` using a shared compact structure.

**CLI B: Real-path doc discovery**
Add `siyuan doc list` and `siyuan doc read <path-or-name>`, backed by shipped docs on disk and explicit real-path disclosure in `--help` and command output.

**Skill C: Single-skill simplified UX**
Reduce `siyuan skill` to `install [--target <name>] [--local]`, `read`, and `uninstall [--target <name>] [--local]`, removing the redundant skill name and making install overwrite existing targets as update behavior.

**Bootstrap D: Thin skill + aligned docs hints**
Keep the bundled SKILL as a thin bootstrap layer that points agents to the docs root and `siyuan doc list`, while top-level help adopts the same entry pattern.

### Scope Summary
| File | Change |
|---|---|
| `src/cli.ts` | register `doc` command and revise top-level/docs help hints |
| `src/commands/doc.ts` | add doc list/read command handlers |
| `src/core/docs.ts` | add docs root resolution, frontmatter parsing, listing, reading, and name resolution |
| `src/commands/skill.ts` | simplify subcommands and arguments around `--target <name> [--local]` |
| `src/core/skills.ts` | implement single-skill install/update/read/uninstall behavior and target normalization |
| `src/docs/README.md` | add recipe entry guidance and mention `siyuan doc list` |
| `src/docs/recipes/*.md` | add four task recipes |
| `src/docs/cli-usage/cli-overview.md` | update command tree and skill/doc usage |
| `README.md` | update public command examples and skill usage |
| `skills/siyuan-cli/SKILL.md` | simplify bootstrap guidance and point to docs root/doc list |
| `tests/*` | add coverage for docs discovery and simplified skill behavior |

### Design Reference
→ 详细技术设计见 [design.md](./design.md)

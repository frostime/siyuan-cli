---
name: improve-siyuan-cli-doc-ux
status: DOING
change-type: single
created: 2026-05-11T18:39:25
reference:
  - source: ".sspec/changes/26-05-11T18-39_improve-siyuan-cli-doc-ux/revisions/001-doc-path-resolution.md"
    type: "revision"
    note: "Clarify SKILL doc paths must be accessed through siyuan doc or docs root, not SKILL-relative lookup."
---

# improve-siyuan-cli-doc-ux

## Problem Statement

The current `siyuan-cli` docs already contain enough information, but the same information is split across the SKILL, README, docs index, and extension docs in a way that forces the reader to reconstruct the usage model. This causes avoidable routing friction: users and agents have to infer whether a task belongs to a registered endpoint, tool, raw API call, extension, or downstream workflow skill before they can act.

## Proposed Solution

### Approach

Apply a fidelity-preserving refactor to the existing documentation set instead of adding new topic files. The goal is not to increase information volume, but to rebalance it: top-level docs should route and set safety boundaries; recipe docs should carry the concrete scenario playbooks.

This change keeps the existing command coverage and technical reference intact. It rewrites structure, ordering, and cross-references so a fresh agent sees the operational route first, then lands in a recipe that is deep enough to execute the task without reconstructing the flow from scattered top-level snippets.

### Key Change

**Reframe A: Substrate-first SKILL**  
Restructure `skills/siyuan-cli/SKILL.md` so the top-level message is: this SKILL is a substrate protocol, not a downstream workflow template. Move the layer-routing decision ahead of command detail, keep the current safety/mode logic, and keep the command shortlist grouped by intent rather than presented as a flat reference dump.

**Reflow B: Top-level docs as map, recipes as playbooks**
Rewrite `src/docs/README.md` so it stays a compact docs map instead of duplicating the SKILL router. Deepen the existing recipe files, especially target finding and content reading, so common tasks are executed from recipes rather than from bloated top-level command lists.

**Refine C: README positioning**  
Keep `README.md` human-facing: preserve the project introduction, quick start, and feature overview, but surface the substrate/downstream-skill framing earlier as a short positioning note. Do not turn the README into a task router or docs index; its job stays “what this project is and how to use it at a high level.”

**Tighten D: Extension boundary language**  
Update `src/docs/cli-usage/extension.md` so the distinction between repeated CLI extension work and repeated user workflow skills is explicit. The file remains a technical reference, but it should no longer leave the downstream-skill boundary implicit.

### Scope Summary

| File | Change |
|------|--------|
| `skills/siyuan-cli/SKILL.md` | Reframe the SKILL as the single Agent operational router; reduce command catalog density and route risky tasks to recipes. |
| `src/docs/README.md` | Keep a compact docs map/reference index; remove duplicate router/catalog pressure. |
| `src/docs/recipes/find-target.md` | Expand into the main playbook for locating a user-mentioned document/block. |
| `src/docs/recipes/read-content.md` | Expand into the playbook for reading located documents/blocks safely and incrementally. |
| `src/docs/recipes/connect-workspace.md` | Add stop conditions and first-run workspace recovery guidance. |
| `README.md` | Keep the human-facing introduction intact while moving the substrate/downstream-skill framing earlier as a short positioning note. |
| `src/docs/cli-usage/extension.md` | Clarify extension vs downstream workflow boundary and related guidance. |

### What Stays Unchanged

- No new docs files or recipes are added.
- No CLI runtime behavior changes.
- No endpoint/tool/schema changes.
- Existing recipes and technical reference remain the source of truth; this change only reshapes how the reader reaches them.

### Design Reference

→ See [design.md](./design.md)

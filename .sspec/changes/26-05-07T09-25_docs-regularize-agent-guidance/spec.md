---
name: docs-regularize-agent-guidance
status: REVIEW
change-type: single
created: 2026-05-07T09:25:19
reference: null
---

# docs-regularize-agent-guidance

## Problem Statement

Several agent-facing examples and guidance points have drifted from the current CLI surface, causing avoidable command failures and unclear edit-risk decisions for agents using `siyuan-cli`.

## Proposed Solution

### Approach

Regularize the existing documentation in place instead of adding new documents. Keep `edit-content.md` as the single edit guidance entry, keep the entry SKILL as a compact operation protocol, and keep README human-oriented with pointers to built-in docs for details.

This follows the agreed constraints: no doc-test system, no platform-specific default based on this test harness, no low-confidence SiYuan-internal gotcha documentation, and no new recipe explosion.

### Key Change

**Fix A: Current CLI command examples**
Update stale flags and parameter names in the SKILL and built-in docs so examples match actual CLI help.

**Docs B: Edit content regularization**
Restructure `edit-content.md` around pre-flight, strategy selection, side effects, minimal examples, and verification.

**Skill C: Entry protocol tightening**
Keep fast/slow thinking as the central mode design while clarifying the boundary between safe shortcuts and slow-path edits.

**Readme D: Human-facing cleanup**
Apply minimal README fixes and routing language so detailed usage stays in built-in docs.

### Scope Summary

| File | Change |
|------|--------|
| `skills/siyuan-cli/SKILL.md` | Fix command examples, heredoc pattern, fast/slow boundaries |
| `src/docs/README.md` | Fix stale common-pattern examples |
| `src/docs/recipes/find-target.md` | Fix tree browsing command |
| `src/docs/recipes/edit-content.md` | Regularize edit guidance in place |
| `src/docs/siyuan-guide/document-tree-and-paths.md` | Fix stale CLI mapping commands |
| `src/docs/cli-usage/cli-overview.md` | Add extension command to command tree |
| `README.md` | Fix version drift and human/docs routing language |

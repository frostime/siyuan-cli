# Memory: docs-regularize-agent-guidance

**Updated**: 2026-05-07T09:43

## Git Baseline (Immutable)

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `9b50aefed3cd452e43cfa0b5f1bb6663000f18d1`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
?? test-report.md
```

## State

Implementation complete; change is in REVIEW. Next: user review/acceptance.

## Key Files

- `skills/siyuan-cli/SKILL.md` — installed agent entry protocol; fast/slow mode boundary is sensitive.
- `src/docs/recipes/edit-content.md` — single edit guidance entry; avoid new recipe explosion.
- `src/docs/README.md` — built-in docs index and common patterns.
- `src/docs/cli-usage/cli-overview.md` — built-in command tree.
- `README.md` — human-facing project entry.

## Knowledge

- 2026-05-07T09:26 [Constraint] User rejected platform-specialized Windows/MSYS wording based on current test harness; keep generalized guidance.
- 2026-05-07T09:26 [Constraint] User rejected adding low-confidence SiYuan internal stale-block/attributes gotcha to docs.
- 2026-05-07T09:26 [Constraint] User rejected doc command auto-validation system for this change.
- 2026-05-07T09:26 [Decision] Keep `edit-content.md` as the place for edit guidance; do not create additional edit recipe unless re-approved.
- 2026-05-07T09:26 [Decision] Preserve fast/slow thinking model in SKILL; only tighten boundaries and fix examples.
- 2026-05-07T09:26 [Decision] Treat README as Human User oriented: examples plus routing to built-in docs, not full operational manual.

## Milestones

- 2026-05-07T09:26 Change initialized and implementation started under user-approved scope.
- 2026-05-07T09:43 Updated SKILL, built-in docs, README, and SSPEC records; grep/help/doc-read verification completed.

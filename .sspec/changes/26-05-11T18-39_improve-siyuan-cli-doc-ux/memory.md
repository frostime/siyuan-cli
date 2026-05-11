# Memory: improve-siyuan-cli-doc-ux

**Updated**: <!-- ISO timestamp, minute precision -->

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `3e7a1ac9038fcc7082bbfc42626cced62a17d937`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main [ahead 10]
?? chat-thread-export.xml
```

## State

Implementation complete; waiting for user review. Current result: SKILL is the single Agent router; recipes are deeper playbooks; docs README is compact map/reference.

## Key Files

- `skills/siyuan-cli/SKILL.md` — bundled Agent entry protocol; main place to surface substrate/layer routing.
- `src/docs/README.md` — built-in docs landing page; should become intent-first without adding new topic files.
- `README.md` — public top-level narrative; should surface downstream-skill positioning earlier.
- `src/docs/cli-usage/extension.md` — extension reference; should explicitly distinguish API/tool extensions from downstream Agent SKILLs.

## Knowledge
<!-- MUST apply write-gate: "If this item were lost, would the next agent make a wrong decision?"
Yes → write it. No → skip.

Target reader: a cold-starting agent that can only see spec + design + tasks + this Knowledge.
Exclude: anything already covered by spec/design/tasks (no restating).
Include: rejected approaches with reasons, implicit constraints, user preferences, API/env traps, insights that shaped design choices.

Format: - [timestamp] [Type] content
Types: Decision | Constraint | Gotcha | Rejected | Insight
  Decision  = directional choice made (with rationale)
  Constraint = hard limit imposed externally or by user
  Gotcha     = trap invisible without reading code/docs
  Rejected   = approach considered and discarded (with why — prevents successor from re-trying)
  Insight    = finding that shaped understanding but is not itself a decision

Project-level discoveries → ALSO append to project.md Notes.
Obsolete items → mark [obsolete: timestamp], never silently delete. -->

- [2026-05-11T18:45+08:00] [Decision] User explicitly rejected adding more docs as the primary strategy; this change must be “move, reshape, transform” with fidelity to existing information.
- [2026-05-11T18:45+08:00] [Decision] Scope is Recommended, but constrained: do not add new standalone routing/search/batch/downstream files; use existing SKILL/docs entry points and existing docs.
- [2026-05-11T18:45+08:00] [Decision] SKILL should be moderately refactored, not reduced to a tiny router; keep useful command coverage while changing priority/order.
- [2026-05-11T18:50+08:00] [Decision] README.md is human-facing, not Agent-facing; keep it as project introduction/usage overview and do not turn it into a task router.
- [2026-05-11T19:20+08:00] [Decision] Avoid duplicate full routing tables in SKILL and docs README. SKILL is the Agent operational router; docs README is a compact docs map/reference.
- [2026-05-11T19:20+08:00] [Decision] Recipe docs are too shallow relative to top-level docs; shift concrete scenario guidance into existing recipes instead of adding new files.
- [2026-05-11T19:50+08:00] [Decision] SKILL doc references must explicitly route through `siyuan doc list/read` or docs root from `siyuan --help`; recipe paths are not relative to the SKILL directory.

## Milestones
<!-- MUST append one line per session. Pure facts; new entries appended at the end.
CLI treats the last valid bullet as the latest milestone.
- [ISO timestamp] one-sentence summary -->
- [2026-05-11T18:45+08:00] Created change and drafted spec/design for a fidelity-preserving doc UX refactor.
- [2026-05-11T18:50+08:00] Corrected README scope after user clarified it is human-facing, not an Agent routing surface.
- [2026-05-11T19:20+08:00] Revised implementation direction toward top-level slimming plus deeper existing recipes.
- [2026-05-11T19:43+08:00] Completed implementation and moved change to REVIEW.

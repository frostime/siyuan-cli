# Memory: expose-missing-kernel-endpoints

**Updated**: 2026-05-10T19:36+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `0c65f6e921d3ce0b304b61156beafa6fb3bd066f`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
MM .sspec/requests/26-05-07T13-00_expose-missing-kernel-apis.md
?? .sspec/changes/26-05-10T19-10_raw-api-fallback/
```

## State
<!-- Where we are and what's next — one to three lines.
This is the resume entry point; the first section an agent reads on cold start. -->

Design drafted and revised after gate feedback. Next: defer implementation until endpoint payload/guard research is done, likely in a later session or subagent-assisted pass.

## Key Files
<!-- Files critical to understanding/continuing this change.
- `path/file` — what it contains, why it matters -->

- `.sspec/changes/26-05-10T19-10_expose-missing-kernel-endpoints/spec.md` — endpoint inventory and scope.
- `.sspec/changes/26-05-10T19-10_expose-missing-kernel-endpoints/design.md` — classification/guard design and source priority.
- `src/api/endpoints/index.ts` — built-in endpoint registration point.
- `src/api/endpoints/block/getBlockKramdown.ts` — existing singular endpoint; plural batch endpoint is still missing.

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

- [2026-05-10T19:10+08:00] [Decision] User wants both first and second batch endpoints added, not just the success-criteria subset.
- [2026-05-10T19:10+08:00] [Gotcha] `block.getBlockKramdown` singular already exists; request target is plural `block.getBlockKramdowns`.
- [2026-05-10T19:10+08:00] [Constraint] Exact payload signatures should be verified against kernel docs/source before implementation; the reference docs URL is `https://leolee9086.github.io/siyuan-kernelApi-docs/index.html`.
- [2026-05-10T19:36+08:00] [Constraint] User rejected confident guard-intent wording before research; spec/design must treat guard paths as hypotheses until docs/source confirm API shapes.

## Milestones
<!-- MUST append one line per session. Pure facts; new entries appended at the end.
CLI treats the last valid bullet as the latest milestone.
- [ISO timestamp] one-sentence summary -->

- [2026-05-10T19:10+08:00] Created change and drafted spec/design for the missing built-in kernel endpoints.
- [2026-05-10T19:36+08:00] Revised endpoint design to make payload/guard details research-required and postponed implementation.

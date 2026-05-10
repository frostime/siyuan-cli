# Memory: raw-api-fallback

**Updated**: 2026-05-10T20:02+08:00

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
M  .sspec/requests/26-05-07T13-00_expose-missing-kernel-apis.md
```

## State
<!-- Where we are and what's next — one to three lines.
This is the resume entry point; the first section an agent reads on cold start. -->

Raw API fallback implementation is complete and change status is REVIEW. Next: user review/acceptance; endpoint补齐 change remains deferred for research.

## Key Files
<!-- Files critical to understanding/continuing this change.
- `path/file` — what it contains, why it matters -->

- `.sspec/changes/26-05-10T19-10_raw-api-fallback/spec.md` — agreed scope for raw fallback.
- `.sspec/changes/26-05-10T19-10_raw-api-fallback/design.md` — config contract, command flow, error/warning semantics.
- `src/api/command.ts` — target integration point for `siyuan api raw`.
- `src/shared/schema.ts` / `src/workspace/config.ts` / `src/workspace/project-config.ts` — behavior config types, validation, resolution.

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

- [2026-05-10T19:10+08:00] [Decision] User selected config-based raw authorization: raw requires both `enabled: true` and endpoint patterns; config errors should give clear raw invocation hints.
- [2026-05-10T19:10+08:00] [Decision] Project-level `.siyuan-cli.yaml` may enable raw API.
- [2026-05-10T19:10+08:00] [Decision] Successful raw calls should not require extra approval; warnings are acceptable, but stdout must remain pure JSON for `jq` parsing.
- [2026-05-10T19:10+08:00] [Rejected] Do not rely on normal permission resource rules for raw; no schema means no trustworthy `payloadTargets` or risk classification.
- [2026-05-10T19:36+08:00] [Constraint] User clarified raw phase should not add or continue an approval mechanism; keep raw simple with config allowlist and stderr warnings only.
- [2026-05-10T19:48+08:00] [Gotcha] `pnpm run siyuan` prepends pnpm script text to captured stdout; use `node bin/siyuan.mjs ...` when verifying raw stdout purity.
- [2026-05-10T20:02+08:00] [Insight] Live raw test against dev workspace: `asset.getDocAssets` with doc id `20240922152051-7dpjfpv` returned a JSON array of asset paths, while the external docs page described a `{ assets: [...] }` object; implementation correctly preserves actual kernel `data` shape.

## Milestones
<!-- MUST append one line per session. Pure facts; new entries appended at the end.
CLI treats the last valid bullet as the latest milestone.
- [ISO timestamp] one-sentence summary -->

- [2026-05-10T19:10+08:00] Created change and drafted spec/design for config-gated raw API fallback.
- [2026-05-10T19:36+08:00] Switched to branch `feat/raw-api-fallback` and revised design to remove approval ambiguity.
- [2026-05-10T19:48+08:00] Implemented raw behavior config, raw command, docs, and verification; full test suite still has unrelated getChildBlocks assertion failure.
- [2026-05-10T20:02+08:00] Per user request, temporarily enabled `asset.getDocAssets` in project `.siyuan-cli.yaml`, verified raw call against dev workspace, and restored config with no diff.

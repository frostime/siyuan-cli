---
revision: 1
date: 2026-05-07T15:11:23
trigger: review-feedback
---

<!-- MUST set trigger to one of: review-feedback | discovery | scope-expansion | correction
This file records scope/design changes after the design gate.
spec.md and design.md baselines are immutable; all post-gate evolution goes here.
File naming: revisions/NNN-description.md (incrementing number). -->

# Keep approval diagnostics on stderr in json mode

## Reason

`--print json` must remain a single stdout envelope for jq/pipes, while approval-pending and auto-open diagnostics still need to be emitted immediately during the blocking wait. Those diagnostics therefore stay on stderr, and the skill/docs need to say that explicitly so agents do not move them into stdout.

## Changes

### Spec Impact

No change to the baseline spec contract.

### Design Impact

No change to the envelope shape. The operational note is: approval-pending and auto-open diagnostics stay on stderr even in json mode.

### Task Impact

- Update `src/approval/client.ts` so approval diagnostics always remain on stderr and are only mirrored into json extra, never moved out of the immediate stream.
- Update `skills/siyuan-cli/SKILL.md` and `src/docs/cli-usage/cli-overview.md` to state the stderr rule explicitly.
- Remove the unused `JsonPrintContext` helper from `src/shared/output.ts`.


---
revision: 4
date: 2026-05-11T17:48:52
trigger: "review-feedback"
---

<!-- MUST set trigger to one of: review-feedback | discovery | scope-expansion | correction
This file records scope/design changes after the design gate.
spec.md and design.md baselines are immutable; all post-gate evolution goes here.
File naming: revisions/NNN-description.md (incrementing number). -->

# update-agent-docs-for-batch-and-filtering-guidance

## Reason
Post-commit user-perspective review found that bundled SKILL/docs did not yet teach the new batch endpoints, `CONTENT_FILTERED` interpretation, and raw/extension choice strategy. It also found outdated command examples with wrong ID flag casing and an extension raw-call example that treated unwrapped data as an envelope.

## Changes

### Spec Impact
Bundled user-facing guidance must recommend batch endpoints for multiple known IDs, explain permission-filtered partial results, and keep command examples aligned with actual CLI flag names and return shapes.

### Design Impact
No runtime design change. Documentation and bundled skill guidance only.

### Task Impact
Add feedback tasks to update the bundled skill and docs, then verify docs grep/typecheck as appropriate.

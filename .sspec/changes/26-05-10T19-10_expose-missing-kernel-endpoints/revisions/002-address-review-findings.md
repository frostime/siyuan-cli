---
revision: 2
date: 2026-05-11T02:20:00
trigger: "review-feedback"
---

# Address review findings

## Reason

A subagent audit of `main...HEAD` identified two must/should review items accepted for this change:

1. `applyPayloadGuard` skipped empty-string payload target values globally, which was too broad for the intended optional-anchor use case.
2. Agent-facing docs and raw API tests needed focused coverage for the new raw fallback and batch endpoints.

The audit also raised a possible nullable `block.getDocsInfo` response item issue. By user decision, that item is not changed here under YAGNI; it is recorded as a separate request for investigation.

## Changes

### Spec Impact

The missing-endpoint change now requires optional-empty payload target behavior to be explicit per target rather than global. Raw API and new batch endpoints also require concise Agent-facing docs and limited automated raw command coverage.

### Design Impact

- Add `PayloadTargetSpec.skipEmpty?: boolean`.
- `applyPayloadGuard` rejects empty strings by default and skips them only when `skipEmpty: true` is declared.
- Apply `skipEmpty` only to verified optional anchor fields such as `block.batchInsertBlock` anchors and `block.moveBlock.previousID`.
- Keep `getDocsInfo` nullable-item response handling out of this change; track separately in `.sspec/requests/26-05-11T02-06_investigate-nullable-getdocsinfo-response-items.md`.
- Add concise docs for `api raw` and common batch endpoint usage.
- Add limited raw tests for endpoint normalization, allowlist behavior, and pure JSON stdout/stderr warning behavior.

### Task Impact

Add feedback tasks to `tasks.md` for explicit `skipEmpty`, raw tests, concise docs, and verification.

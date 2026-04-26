---
revision: 4
date: 2026-04-26T16:07:11
trigger: "correction"
---

# readability-split-runtime-and-client

## Reason
Readability audit found three disorder patterns:
1. `runtime.ts` (348 lines) is a grab-bag mixing 5 unrelated concerns: paths, file I/O, broker process, browser opening, and lock management.
2. `client.ts` mixes HTTP helpers, business logic, and CLI command implementations in one file.
3. Function naming in runtime.ts doesn't distinguish broker-specific paths from generic utilities.

Pure internal reorganization — no external behavior change, no new contracts.

## Changes

### Spec Impact
None. Exported API surface unchanged; spec.md remains predictive.

### Design Impact
None. Internal file organization only.

### Task Impact
Add a readability-focused task set:
- Extract `broker-paths.ts` from `runtime.ts` (path helpers + file I/O)
- Extract `broker-browser.ts` from `runtime.ts` (browser opening logic)
- Move CLI command implementations from `client.ts` into `command.ts`
- Rename `get*File()` path helpers to named constants where appropriate
- Verify build + tests pass after each extraction

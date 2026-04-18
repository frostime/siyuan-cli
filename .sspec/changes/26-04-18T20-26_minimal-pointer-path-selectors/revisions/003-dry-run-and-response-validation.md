---
revision: 3
date: 2026-04-19T02:19:17+08:00
trigger: "review-feedback"
---

# dry-run and response validation

## Reason
Review of the docs-to-code alignment surfaced two worthwhile implementation fixes:

1. real CLI execution still had an early `--dry-run` shortcut in `src/commands/api.ts`, which bypassed workspace resolution and payload guard enforcement even though the shared execution path in `executeEndpoint()` already handled dry-run correctly.
2. declarative response filtering already relied on terminal-array write-back semantics at runtime, but startup validation did not reject unsupported `response.itemsAt` shapes early enough.

These are code-level correctness improvements discovered during documentation alignment, so they belong in the current change as a revision.

## Changes

### Spec Impact
No external contract expansion. The revision tightens when existing rules are enforced:

- dry-run for `siyuan api` now follows the same guard-first execution path as normal calls
- response `itemsAt` write-back compatibility is checked at startup, not deferred to runtime filtering

### Design Impact
`response.itemsAt` remains a read grammar, but declarative response filtering is now explicitly validated against terminal-filter requirements during schema registration.

CLI dry-run behavior becomes single-sourced in `executeEndpoint()`.

### Task Impact
- remove the command-layer dry-run bypass in `src/commands/api.ts`
- add startup validation for declarative response terminal-filter compatibility
- add regression coverage for startup rejection and dry-run guard consistency

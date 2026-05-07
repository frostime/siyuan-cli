# Memory: json-print-envelope

**Updated**: 2026-05-07T13:41+08:00

## Git Baseline (Immutable)

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli.worktree-fix-json-mode`
- Branch: `fix-json-mode`
- HEAD: `e6a8e478386a6eba0d24b3bb073a1704fe5880d6`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## fix-json-mode
 M .sspec/.meta.json
```

## State

Implementation is complete for the json-print envelope change. Full suite still reports two unrelated pre-existing failures in `tests/block-operations.test.ts` and `tests/extension-system.test.ts`.

## Key Files

- `src/shared/output.ts` — current print path; envelope construction will start here.
- `src/api/guard.ts` — emits warnings/notices and approval-triggered diagnostics today.
- `src/approval/client.ts` — writes approval events directly to stderr today.
- `src/tool/registry.ts` — tool json-mode output and warning/meta split point.

## Knowledge

- [2026-05-07T13:41+08:00] [Constraint] Internal-only contract: beta status means external jq compatibility is out of scope; the only requirement is self-consistent `siyuan-cli` behavior.
- [2026-05-07T13:41+08:00] [Decision] `--print json` should become a single envelope on stdout for `api` and `tool`, with `data` carrying the primary payload and `extra` carrying diagnostics.
- [2026-05-07T13:xx+08:00] [Insight] The collector stays minimal: `warnings`, `notices`, `approvals`, `debug`, plus optional `meta`; no separate output bus was needed.
- [2026-05-07T13:41+08:00] [Gotcha] Approval flow currently emits intermediate JSON events on stderr from `src/approval/client.ts`; those must be collected if json-mode is to stay internally coherent.
- [2026-05-07T13:41+08:00] [Insight] Success-path output is already centralized enough in `preparePrintedOutput()` to make the envelope change localized; the real work is diagnostic collection, not payload formatting.
- [2026-05-07T13:41+08:00] [Constraint] Global npm-installed `siyuan` can be used only as a smoke reference; it is not authoritative for this checkout.

## Milestones

- [2026-05-07T13:41:32+08:00] Created `json-print-envelope` change, confirmed clarify is done, and drafted the fixed-envelope design for @align.
- [2026-05-07T13:xx+08:00] Implemented the envelope, wired approval/guard diagnostics into json extra, and added regression tests for parseability.

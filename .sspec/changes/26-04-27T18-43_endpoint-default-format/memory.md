# Memory: endpoint-default-format

**Updated**: 2026-04-27T21:06+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `409e0f0044ff7d1a3708cafb211432f2e9f79f40`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
```

## State

- Change is in `REVIEW`: implementation complete and verification tasks are checked.
- Runtime checks were executed against a live kernel for compact/json/custom-format paths.
- Next step is user acceptance and final status transition (`REVIEW -> DONE`).

## Key Files

- `src/shared/schema.ts` — defines `FormatStrategy` and `EndpointSchema.formatStrategy`.
- `src/shared/output.ts` — strategy formatter implementations and dispatcher.
- `src/api/command.ts` — compact render resolution order (`format` -> `formatStrategy` -> fallback).
- `.sspec/changes/26-04-27T18-43_endpoint-default-format/tasks.md` — verification completion record.
- `scripts/try-all-apis.ps1` — runtime validation helper for strategy outputs.

## Knowledge

- [2026-04-27T21:06+08:00] [Decision] `--print json` in current CLI prints the guarded `data` value directly, consistent with existing `preparePrintedOutput` behavior.
- [2026-04-27T21:06+08:00] [Gotcha] `filetree.getHPathByID` may return `<no value>` for some docs; this is a kernel/data condition and does not indicate formatter failure.
- [2026-04-27T21:06+08:00] [Decision] `filetree.createDailyNote` belongs to `object` strategy (`{id}` response), and assignment docs were normalized accordingly.

## Milestones

- [2026-04-27T21:06+08:00] Completed cleanup pass: fixed spec/design/task consistency, marked runtime verification done, and aligned memory state for review.

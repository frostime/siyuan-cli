# Memory: confirm-human-approval-channel

**Updated**: <!-- ISO timestamp, minute precision -->

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `da92b2fda200c627e630ccbd3e3653c6ab017072`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
?? .sspec/requests/26-04-26T00-03_confirm-human-approval-channel.md
```

## State
Implementation is mostly in place under `src/approval/`: broker, runtime, store, UI, client, command surface, and guard integration are working. Next step: finish validation coverage for multi-request/timeout/auto-shutdown and then present the implementation for review.

## Key Files
- `.sspec/requests/26-04-26T00-03_confirm-human-approval-channel.md` — original request and success criteria
- `.sspec/changes/26-04-26T00-34_confirm-human-approval-channel/spec.md` — proposed broker-based approval solution and scope
- `.sspec/changes/26-04-26T00-34_confirm-human-approval-channel/design.md` — cohesive `src/approval/` module design with explicit module boundary, call flow, transport, and UI contract
- `src/approval/` — implemented approval module: broker, runtime, store, UI, client, command surface
- `src/core/guard.ts` — confirm gate now hands off to approval flow
- `H:/SrcCode/playground/simple-lsp-cli/src/daemon.ts` — reference daemon pattern for lazy startup, Windows port file, and idle shutdown

## Knowledge
- [2026-04-26T00:35+08:00] [Decision] User prefers automatic UI appearance, inline wait on the original command, default 60s timeout, and support for multiple pending approvals in one place.
- [2026-04-26T00:35+08:00] [Decision] `--yes` stays, but the new approval channel becomes the primary confirm UX in docs and guidance.
- [2026-04-26T00:35+08:00] [Decision] Chosen architecture is on-demand local broker + browser Approval Center + inline CLI wait.
- [2026-04-26T00:44+08:00] [Decision] Approval should be implemented as one cohesive module under `src/approval/`, with `src/core/guard.ts` as the main integration seam.
- [2026-04-26T00:44+08:00] [Decision] MVP transport contract is explicit: CLI -> broker via localhost HTTP, CLI waits via long-poll, browser queue refresh uses simple polling.
- [2026-04-26T00:47+08:00] [Decision] Broker lifecycle is lazy start + auto cleanup: stay alive while pending requests exist, queue-empty grace period 30s, hard idle timeout 5min, stale pid/port cleanup on next ensureBroker(), and browser polling does not keep the broker alive.
- [2026-04-26T00:35+08:00] [Gotcha] The current repo has no existing runtime-state helper or browser-open utility, so runtime path and open-browser behavior will need a new shared utility.
- [2026-04-26T00:35+08:00] [Gotcha] `simple-lsp-cli` proves the daemon lifecycle pattern, but its transport is a private newline JSON socket; this change needs HTTP endpoints and browser-facing behavior.

## Milestones
- [2026-04-26T00:35:39+08:00] Created change `26-04-26T00-34_confirm-human-approval-channel`, reviewed current confirm path, examined `simple-lsp-cli` daemon design, and drafted spec/design for an on-demand approval broker.
- [2026-04-26T00:44:00+08:00] Rewrote design to improve predictability, centered all approval logic in `src/approval/`, and made the data-flow/transport contract explicit.
- [2026-04-26T01:05:00+08:00] Implemented the first end-to-end approval module, integrated guard handoff, verified broker start/list/stop commands, and added initial runtime/store tests.

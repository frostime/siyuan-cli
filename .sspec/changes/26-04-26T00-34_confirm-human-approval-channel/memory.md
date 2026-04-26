# Memory: confirm-human-approval-channel

**Updated**: 2026-04-26T15:24+08:00

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
The approval flow is now in active implementation and stabilization. Broker binding, local authorization, standalone Approval Center template loading, and CLI-side auto-open are implemented; next step is broader validation coverage and final review of browser-approve / reject / timeout behavior before moving to review.

## Key Files
- `.sspec/requests/26-04-26T00-03_confirm-human-approval-channel.md` — original request and success criteria
- `.sspec/changes/26-04-26T00-34_confirm-human-approval-channel/spec.md` — approved solution scope; status now in implementation
- `.sspec/changes/26-04-26T00-34_confirm-human-approval-channel/design.md` — baseline module design and transport contract
- `.sspec/changes/26-04-26T00-34_confirm-human-approval-channel/revisions/001-stabilize-approval-broker-flow.md` — broker consistency/security corrections
- `.sspec/changes/26-04-26T00-34_confirm-human-approval-channel/revisions/002-externalize-approval-center-template.md` — standalone HTML template correction
- `src/approval/` — implemented approval module: broker, runtime, store, client, command surface, template-backed UI
- `src/approval/approval-center.html` — extracted Approval Center HTML/JS asset
- `src/core/guard.ts` — confirm gate now hands off to approval flow
- `H:/SrcCode/playground/simple-lsp-cli/src/daemon.ts` — reference daemon pattern for lazy startup, Windows port file, and idle shutdown

## Knowledge
- [2026-04-26T00:35+08:00] [Decision] User prefers automatic UI appearance, inline wait on the original command, default 60s timeout, and support for multiple pending approvals in one place.
- [2026-04-26T00:35+08:00] [Decision] `--yes` stays, but the new approval channel becomes the primary confirm UX in docs and guidance.
- [2026-04-26T00:35+08:00] [Decision] Chosen architecture is on-demand local broker + browser Approval Center + inline CLI wait.
- [2026-04-26T00:44+08:00] [Decision] Approval should be implemented as one cohesive module under `src/approval/`, with `src/core/guard.ts` as the main integration seam.
- [2026-04-26T00:44+08:00] [Decision] MVP transport contract is explicit: CLI -> broker via localhost HTTP, CLI waits via long-poll, browser queue refresh uses simple polling.
- [2026-04-26T00:47+08:00] [Decision] Broker lifecycle is lazy start + auto cleanup: stay alive while pending requests exist, queue-empty grace period 30s, hard idle timeout 5min, stale pid/port cleanup on next ensureBroker(), and browser polling does not keep the broker alive.
- [2026-04-26T01:45+08:00] [Decision] Documentation changes can wait; the next git should focus on correctness fixes for the approval flow itself.
- [2026-04-26T15:10+08:00] [Decision] The Approval Center HTML/JS should live in a standalone template file and be loaded with small placeholder substitution, rather than embedded as one large TypeScript string.
- [2026-04-26T15:20+08:00] [Decision] Browser auto-open belongs in the CLI-side `requestAndWait()` flow after the approval URL is created; this gives the requesting CLI direct control over when the approval page opens.
- [2026-04-26T01:48+08:00] [Gotcha] Manual test of a confirm-gated command produced `APPROVAL_PENDING` with broker URL `http://127.0.0.1:8908/approval`, but the browser page stayed on `Loading...` and the request later timed out; reopening the center started a new broker on another port (`9120`). This confirms create/open/wait can drift across broker instances.
- [2026-04-26T01:50+08:00] [Gotcha] The current Approval Center gives weak failure feedback; when the backing broker is gone or replaced, the UI effectively looks empty/loading instead of explicitly showing broker disconnect or expired request state.
- [2026-04-26T01:52+08:00] [Gotcha] Independent code review found two high-severity issues: localhost mutating approval routes have no broker secret, and concurrent `ensureBroker()`/`createApproval()` can spawn multiple brokers and split a single flow across ports.
- [2026-04-26T00:35+08:00] [Gotcha] The current repo has no existing runtime-state helper or browser-open utility, so runtime path and open-browser behavior will need a new shared utility.
- [2026-04-26T00:35+08:00] [Gotcha] `simple-lsp-cli` proves the daemon lifecycle pattern, but its transport is a private newline JSON socket; this change needs HTTP endpoints and browser-facing behavior.

## Milestones
- [2026-04-26T00:35:39+08:00] Created change `26-04-26T00-34_confirm-human-approval-channel`, reviewed current confirm path, examined `simple-lsp-cli` daemon design, and drafted spec/design for an on-demand approval broker.
- [2026-04-26T00:44:00+08:00] Rewrote design to improve predictability, centered all approval logic in `src/approval/`, and made the data-flow/transport contract explicit.
- [2026-04-26T01:05:00+08:00] Implemented the first end-to-end approval module, integrated guard handoff, verified broker start/list/stop commands, and added initial runtime/store tests.
- [2026-04-26T01:40:00+08:00] Ran a subagent code review and a real manual confirm test; both exposed correctness gaps in broker security and broker-instance consistency, so the next pass will be a fix-focused git.
- [2026-04-26T15:24:59+08:00] Completed Revision 002 by extracting the Approval Center into a standalone HTML asset, wiring template loading/copying, and moving auto-open responsibility into the CLI-side approval request flow.

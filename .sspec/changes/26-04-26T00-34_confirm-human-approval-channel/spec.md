---
name: confirm-human-approval-channel
status: PLANNING
change-type: single
created: 2026-04-26 00:34:51
reference:
- source: .sspec/requests/26-04-26T00-03_confirm-human-approval-channel.md
  type: request
  note: Linked from request
---
<!-- @RULE: Frontmatter
status: PLANNING | DOING | REVIEW | DONE | BLOCKED
change-type: single | sub
reference?: Array<{source, type: 'request'|'root-change'|'sub-change'|'prev-change'|'doc'|'revision', note?}>

Sub-change MUST link root:
reference:
  - source: ".sspec/changes/<root-change-dir>"
    type: "root-change"
    note: "Phase <n>: <phase-name>"

Single-change common reference:
reference:
  - source: ".sspec/requests/<request-file>.md"
    type: "request"
  - source: ".sspec/changes/<change-dir>"
    type: "prev-change"
    note: "Follow-up to <change-name>."
-->

# confirm-human-approval-channel

## Problem Statement
The current `confirm` path couples risk discovery, context presentation, and approval into one failing retry loop: the CLI stops with `CONFIRMATION_REQUIRED` and asks the operator to re-run with `--yes`. In local agent workflows this breaks the natural `agent proposes → human approves → system executes` split, forces the human to reconstruct the original command, and offers no first-class queue, timeout, or audit record when several approvals are pending.

The desired experience is a low-friction local approval handoff: when a confirm-gated write is reached, the approval UI should appear automatically, the original command should wait inline for a bounded time, and multiple pending approvals should be visible in one place.

## Proposed Solution

### Approach
Introduce an on-demand local Approval Broker that owns a localhost Approval Center and a small persistent queue of approval requests. When `executeEndpoint()` reaches a `confirm` decision and the caller did not pass `--yes`, the CLI will create an approval request, auto-open the Approval Center in the browser, and wait inline for a bounded decision window (default `60s`). If the request is approved, the original command resumes and executes the exact prepared payload; if it is rejected, timed out, or cancelled, the CLI exits with an explicit structured error.

The broker is a separate process because the final UX needs one shared queue, one reusable browser page, and clean handling for multiple simultaneous approvals. The CLI remains responsible for discovery and for resuming the original command. This keeps the safety boundary at the existing guard layer while avoiding command reconstruction.

`--yes` stays as the direct fast path for a human already at the terminal. The new approval channel becomes the primary confirm experience. Existing permission evaluation, risk derivation, and `--dry-run` preview semantics remain intact.

### Key Change
**Feat A: Approval Broker runtime** — Add a lazily started local broker process that exposes localhost HTTP endpoints, persists pending approval requests, auto-opens the Approval Center, and exits after an idle timeout.

**Feat B: Confirm gate handoff** — Replace the immediate `ConfirmationRequiredError` path in `executeEndpoint()` with broker submission + inline wait when `wouldConfirm && !yes`, while preserving `--yes` as the direct bypass.

**Feat C: Approval Center queue UX** — Present pending requests in one Approval Center page with per-request summary, preview, risk label, countdown, and explicit actions for approve / reject. Multiple approvals share one queue and one browser page.

**Feat D: Approval control surface and errors** — Add CLI commands for broker status and manual approval fallback, plus explicit terminal outcomes for `APPROVAL_REJECTED`, `APPROVAL_TIMEOUT`, and `APPROVAL_CANCELLED`.

### Scope Summary
| File | Change |
|------|--------|
| `src/approval/*` | Cohesive approval module: types, client, runtime, broker, store, UI, errors, and command surface |
| `src/core/guard.ts` | Single integration seam: hand off confirm-gated writes to `approval.requestAndWait()` and resume on approval |
| `src/cli.ts` | Register the approval command group |
| `src/docs/cli-usage/*` | Document Approval Center flow, timeout, queue behavior, and `--yes` positioning |

### Design Reference
→ Detailed technical design: [design.md](./design.md)

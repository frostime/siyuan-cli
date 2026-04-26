---
revision: 1
date: 2026-04-26T02:02:39
trigger: "discovery"
---

<!-- @RULE: trigger values: review-feedback | discovery | scope-expansion | correction
本文件记录 design gate 后的范围/设计变更。
spec.md 和 design.md 基线不可变，所有后续演化通过此类文件记录。
文件命名：revisions/NNN-description.md（编号递增）。 -->

# stabilize-approval-broker-flow

## Reason
Real manual testing of a confirm-gated command (`siyuan api system.currentTime`) and an independent code-review subagent both exposed correctness gaps in the first approval-flow implementation.

Observed failure chain:
1. CLI emitted `APPROVAL_PENDING` with broker URL `http://127.0.0.1:8908/approval`
2. The Approval Center page stayed at `Loading...`
3. Re-opening the center later started another broker on a different port (`9120`)
4. The original request timed out

This means the implemented flow can split one approval lifecycle across different broker instances, so the original design baseline no longer predicts the actual runtime behavior. The revision is therefore required before more implementation continues.

## Changes

### Spec Impact
The user-visible promise in `spec.md` stays the same: auto-open Approval Center, inline wait, explicit timeout/reject/cancel outcomes, and a reusable local approval channel.

What changes is the minimum correctness bar for that promise:
- A single approval request MUST stay bound to one broker instance for create/open/wait/decision.
- Approval mutation routes MUST be protected from arbitrary localhost callers.
- Approval UI MUST surface broker-disconnect / expired-request failures explicitly enough for a human to recover.
- Read-only inspection commands SHOULD avoid starting a new broker implicitly.

### Design Impact
The broker design needs four concrete corrections:

1. **Single-instance binding**
   - `requestAndWait()` MUST resolve the broker once and reuse the same `baseUrl` for create + wait.
   - Broker startup needs a lock / handshake so concurrent callers do not spawn multiple brokers and race on the port file.

2. **Broker-local authorization**
   - The broker MUST generate a local secret/session token.
   - All mutating routes (`create`, `approve`, `reject`, `cancel`, `shutdown`) MUST require that token.
   - The Approval Center browser page MUST receive the token through the served HTML / bootstrap state and send it on mutation requests.

3. **Lifecycle correctness**
   - Active waiters MUST count as broker activity and prevent premature shutdown.
   - Queue-empty grace and hard-idle shutdown logic MUST remain consistent when a request is pending, waiting, timing out, or being resolved.

4. **UI failure states**
   - Browser polling failures MUST render an explicit disconnected/error state instead of a silent `Loading...` stall.
   - Expired requests and missing requests MUST show a clear recovery hint.

These are corrections to the approved design, not a feature expansion.

### Task Impact
`tasks.md` needs a fix-focused follow-up section that covers:
- broker single-instance and startup synchronization
- broker secret/token plumbing for mutating routes
- client command behavior for non-2xx broker responses and read-only commands
- Approval Center disconnected/expired UI states
- regression tests for create/wait consistency, timeout, and multi-process startup races

---
change: "confirm-human-approval-channel"
updated: ""
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Approval module skeleton ⏳
- [ ] Create `src/approval/types.ts` and `src/approval/errors.ts` per `design.md` interface and error contracts
- [ ] Create `src/approval/runtime.ts` for state dir paths, pid/port discovery, stale cleanup, lazy broker start, and auto-shutdown policy constants
- [ ] Create `src/approval/store.ts` for request persistence, audit append, queue listing, and timeout state transitions
**Verification**: `src/approval/` compiles with the designed types and lifecycle primitives.

### Phase 2: Broker and client transport ⏳
- [ ] Create `src/approval/broker.ts` to expose localhost HTTP routes, maintain waiters, auto-open the Approval Center, and enforce queue-empty grace plus hard idle shutdown
- [ ] Create `src/approval/ui.ts` to serve the built-in Approval Center HTML and browser polling script
- [ ] Create `src/approval/client.ts` and `src/approval/index.ts` for `ensureBroker()` and `requestAndWait()` over HTTP + long-poll
**Verification**: A local approval request can be created, listed, waited on, approved/rejected, and cleaned up through the broker API.

### Phase 3: CLI integration ⏳
- [ ] Create `src/approval/command.ts` for `siyuan approval status|list|show|approve|reject|open|stop`
- [ ] Register the approval command in `src/cli.ts`
- [ ] Integrate `src/core/guard.ts` with `approval.requestAndWait()` while preserving `--yes` and `--dry-run` behavior
**Verification**: A confirm-gated CLI call opens the Approval Center, emits `APPROVAL_PENDING`, waits inline, and resumes only after approval.

### Phase 4: Docs and validation ⏳
- [ ] Update `src/docs/cli-usage/cli-overview.md`, `src/docs/cli-usage/config-and-permission.md`, and related recipe docs for Approval Center, timeout, queue, and broker lifecycle behavior
- [ ] Add or update tests for single approval, multiple pending approvals, timeout, and broker auto-shutdown behavior
**Verification**: Docs describe the new flow accurately and tests cover the designed approval lifecycle.

<!-- @RULE: Organize by phases. Each task <2h, independently testable.
Phase emoji: ⏳ pending | 🚧 in progress | ✅ done

### Phase 1: <name> ⏳
- [ ] Task description `path/file.py`
- [ ] Task description `path/file.py`
**Verification**: <how to verify this phase>

### Feedback Tasks (→ [NNN-description](./revisions/NNN-description.md))
Use this section for review/feedback tasks that still belong to the current change.

If accepted feedback changes scope/design:
- **Pre-gate** (spec not yet approved): update `spec.md` / `design.md` directly, then add tasks here.
- **Post-gate** (design baseline locked): create `revisions/NNN-*.md` FIRST, then update this section. Do NOT edit `spec.md` / `design.md`.

The section header MUST link the corresponding revision file (relative path).
If the work belongs in a new follow-up or replacement change, the agent MUST NOT put it here unless the user has first approved that direction via `@align`.
-->

---

## Progress

**Overall**: 25%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 0% | ⏳ |
| Phase 3 | 0% | ⏳ |
| Phase 4 | 0% | ⏳ |

**Recent**:
- Rewrote `design.md` to center the feature around one cohesive `src/approval/` module.
- Made the transport contract explicit: CLI -> broker via localhost HTTP, CLI waits via long-poll, browser refreshes queue via polling in MVP.
- Added broker lifecycle rules to the design: queue-empty grace period, hard idle timeout, stale-state cleanup, and browser polling not extending broker lifetime.

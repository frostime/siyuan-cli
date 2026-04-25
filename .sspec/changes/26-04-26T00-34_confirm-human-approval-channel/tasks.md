---
change: "confirm-human-approval-channel"
updated: ""
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Approval module skeleton ✅
- [x] Create `src/approval/types.ts` and `src/approval/errors.ts` per `design.md` interface and error contracts
- [x] Create `src/approval/runtime.ts` for state dir paths, pid/port discovery, stale cleanup, lazy broker start, and auto-shutdown policy constants
- [x] Create `src/approval/store.ts` for request persistence, audit append, queue listing, and timeout state transitions
**Verification**: `src/approval/` compiles with the designed types and lifecycle primitives.

### Phase 2: Broker and client transport ✅
- [x] Create `src/approval/broker.ts` to expose localhost HTTP routes, maintain waiters, auto-open the Approval Center, and enforce queue-empty grace plus hard idle shutdown
- [x] Create `src/approval/ui.ts` to serve the built-in Approval Center HTML and browser polling script
- [x] Create `src/approval/client.ts` and `src/approval/index.ts` for `ensureBroker()` and `requestAndWait()` over HTTP + long-poll
**Verification**: A local approval request can be created, listed, waited on, approved/rejected, and cleaned up through the broker API.

### Phase 3: CLI integration ✅
- [x] Create `src/approval/command.ts` for `siyuan approval status|list|show|approve|reject|open|stop`
- [x] Register the approval command in `src/cli.ts`
- [x] Integrate `src/core/guard.ts` with `approval.requestAndWait()` while preserving `--yes` and `--dry-run` behavior
**Verification**: A confirm-gated CLI call opens the Approval Center, emits `APPROVAL_PENDING`, waits inline, and resumes only after approval.

### Phase 4: Docs and validation 🚧
- [x] Update `src/docs/cli-usage/cli-overview.md`, `src/docs/cli-usage/config-and-permission.md`, and related recipe docs for Approval Center, timeout, queue, and broker lifecycle behavior
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

**Overall**: 80%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 50% | 🚧 |

**Recent**:
- Implemented the cohesive `src/approval/` module with broker, store, client, UI, runtime, errors, and command surface.
- Integrated `src/core/guard.ts` with `approval.requestAndWait()` and verified the broker can start/list/stop from the CLI.
- Updated overview and recipe docs for Approval Center behavior and broker lifecycle.

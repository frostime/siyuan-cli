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

### Feedback Tasks (→ [revisions/001-stabilize-approval-broker-flow.md](./revisions/001-stabilize-approval-broker-flow.md))
- [x] Fix broker single-instance behavior in `src/approval/runtime.ts` and `src/approval/client.ts` so create/open/wait stay bound to one broker instance
- [x] Add broker-local authorization in `src/approval/runtime.ts`, `src/approval/broker.ts`, `src/approval/client.ts`, and `src/approval/ui.ts` for all mutating routes
- [x] Tighten broker lifecycle and read-only command behavior in `src/approval/broker.ts` and `src/approval/client.ts` so waiters prevent shutdown and read-only commands do not start a broker unnecessarily
- [x] Improve Approval Center failure states in `src/approval/ui.ts` so broker disconnects and expired requests are visible to the user
- [x] Add regression tests for broker binding, non-2xx broker responses, timeout, and concurrent startup in `tests/approval-*.test.ts`
**Verification**: A real confirm-gated command opens a working Approval Center, stays attached to one broker URL, can be approved end-to-end, and no localhost process can mutate approvals without the broker token.

### Feedback Tasks (→ [revisions/002-externalize-approval-center-template.md](./revisions/002-externalize-approval-center-template.md))
- [x] Move Approval Center markup/script into a standalone HTML template file under `src/approval/`
- [x] Replace the inline HTML string in `src/approval/ui.ts` with file loading + placeholder substitution
- [x] Ensure the Approval Center HTML asset is copied into `dist/approval/` during build/publish
- [x] Re-run browser-based approval testing against the extracted template
**Verification**: The served Approval Center comes from a standalone HTML file, template variables are injected correctly, and browser debugging works directly against the extracted asset.

### Feedback Tasks (→ [revisions/003-auto-open-and-reject-reason.md](./revisions/003-auto-open-and-reject-reason.md))
- [ ] Improve browser auto-open reliability and fallback reporting in `src/approval/runtime.ts` and `src/approval/client.ts`
- [ ] Add optional reject reason plumbing through `src/approval/approval-center.html`, `src/approval/client.ts`, `src/approval/store.ts`, `src/approval/errors.ts`, and `src/approval/command.ts`
- [ ] Validate auto-open and reject-reason behavior in the current Windows/MSYS environment
**Verification**: A confirm-gated CLI call attempts to open the approval page automatically, reject can carry a human reason, and that reason is visible to downstream CLI/agent handling.

### Feedback Tasks (→ [revisions/004-readability-split-runtime-and-client.md](./revisions/004-readability-split-runtime-and-client.md))
- [x] Extract `broker-paths.ts` from `runtime.ts`: path helpers + file I/O primitives
- [x] Extract `broker-browser.ts` from `runtime.ts`: browser opening logic
- [x] Move CLI command implementations from `client.ts` into `command.ts`
- [x] Rename `get*File()` path helpers to named constants where appropriate
- [x] Verify build + all approval tests pass after each extraction
**Verification**: `src/approval/` compiles, all approval tests pass, export surface unchanged.

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

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 50% | 🚧 |
| Feedback / Revision 001 | 100% | ✅ |
| Feedback / Revision 002 | 100% | ✅ |
| Feedback / Revision 003 | 0% | ⏳ |
| Feedback / Revision 004 | 100% | ✅ |

**Recent**:
- Readability refactor: splitting runtime.ts and client.ts for clearer concern separation.

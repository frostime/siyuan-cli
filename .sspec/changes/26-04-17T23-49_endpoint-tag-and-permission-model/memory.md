# Memory: endpoint-tag-and-permission-model (Root)

**Updated**: 2026-04-18T16:54+08:00

## Git Baseline (Immutable)
<!-- Original creation-time baseline was lost in the malformed memory file.
This reconstructed baseline records the branch divergence point explicitly and MUST remain unchanged afterwards. -->

- Captured: reconstructed on 2026-04-18 from current branch topology
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `refactor/safe-guard`
- HEAD at reconstruction: `1650dd4cc2b2ca0fb51c626d0824de7b16bf550e`
- Branch baseline (merge-base with `main`): `2cfb9a12c159e6b9fa1b50b8bdfea891781fddd6`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output at reconstruction time

```text
## refactor/safe-guard
 M .sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/design.md
 M .sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/spec.md
```

## Coordination
<!-- Root change authoritative sub-change summary. -->

| Phase | Sub-Change | Status | Blocker |
|-------|------------|--------|---------|
| P1: Core Contracts | `26-04-18T01-28_p1-core-contracts` | ✅ DONE | — |
| P2: Demo Adoption | `26-04-18T02-23_p2-demo-adoption` | ✅ DONE | — |
| P3: Rollout | `26-04-18T03-11_p3-rollout` | 🔎 REVIEW | Full rollout implemented and validated; awaiting acceptance |

## State

P3 is in REVIEW. Full rollout coverage is implemented and validated, including Phase 6 bridge removal and follow-up review fixes.
Next: capture review acceptance and then close P3 and the root change.
Do not implement directly from the root change.

## Key Files

- `.sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/spec.md` — root phase split, locked decisions, root scope boundary
- `.sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/design.md` — shared contracts for classification, guard, resolver, config v2, and phase boundaries
- `.sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/tasks.md` — root milestones only; sub-changes will hold file-level tasks
- `src/core/schema.ts` — type anchor for `EndpointSchema`, classification, guard contracts
- `src/core/guard.ts` — payload/response enforcement path to be redesigned in P1
- `src/core/permission.ts` — policy engine and content-id resolver anchor
- `src/core/config.ts` — config v2 shape anchor

## Knowledge

- [2026-04-17T23:49] [Decision] This redesign is driven first by payload guard bug B; tag semantics cleanup follows from establishing a single source of truth.
- [2026-04-18T00:58] [VitalFinding] External ClaudeAudit confirmed bug B as real and severe, and recommended demo-first rollout rather than one-shot migration.
- [2026-04-18T00:58] [Decision] This change now acts as a root coordinator: P1 shared contracts, P2 demo endpoints, P3 rollout.
- [2026-04-18T00:58] [Decision] `classification` is the authored truth; tags/risk/requiresConfirmation are registry-derived.
- [2026-04-18T00:58] [Decision] `payloadTargets[]` replaces the old payload record; each target is checked independently.
- [2026-04-18T00:58] [Decision] `kind: "id"` must resolve to `{ notebook, path }` via bulk SQL resolver before policy check.
- [2026-04-18T00:58] [Decision] `mode=read` + `scope=global` endpoints must define response guard or `filterResponse`.
- [2026-04-18T00:58] [Decision] Config v2 splits `content.read/write` and `workspace.read/write`; alpha stage allows breaking reset of old config.
- [2026-04-18T00:58] [Constraint] deny rules are the hard boundary; confirm is interactive guardrail and does not define agent security.
- [2026-04-18T00:58] [Constraint] P1 keeps `ToolSchema` shape stable; only tool allow/deny and endpoint-guard inheritance are in scope.
- [2026-04-18T01:17] [Decision] If P2 demo exposes a contract gap, work MUST return to the P1 sub-change for amendment and re-freeze; P2/P3 do not define ad-hoc contract extensions.
- [2026-04-18T01:17] [Decision] Read and write scopes are independent. Read operations only check `content.read` / `workspace.read`; write operations only check `content.write` / `workspace.write`.
- [2026-04-18T01:17] [Decision] For tool execution, endpoint deny wins over tool allow because hard-deny semantics remain authoritative at the endpoint layer.
- [2026-04-18T01:17] [Gotcha] Original `memory.md` lost the true creation-time baseline; the current baseline is reconstructed from branch topology and must stay frozen from now on.
- [2026-04-18T01:29] [CoordinationDecision] P1 sub-change created as `26-04-18T01-28_p1-core-contracts`; root stays at coordination level only.
- [2026-04-18T01:39] [CoordinationDecision] P1 has finished implementation and validation; root is waiting for P1 review before opening P2.
- [2026-04-18T02:10] [CoordinationDecision] P1 completed revision 001 (contract hardening + tests); ready to close.
- [2026-04-18T02:18] [CoordinationDecision] P1 review passed and the phase is closed; root may open P2.
- [2026-04-18T02:23] [CoordinationDecision] P2 sub-change created as `26-04-18T02-23_p2-demo-adoption`.
- [2026-04-18T02:33] [CoordinationDecision] P2 implemented seven representative endpoint migrations and is ready for review.
- [2026-04-18T03:00] [CoordinationDecision] P2 revision 001 recorded the 3→7 demo expansion and strengthened validation from metadata-only checks to guard-path tests.
- [2026-04-18T03:15] [CoordinationDecision] P3 sub-change created as `26-04-18T03-11_p3-rollout` with batch strategy and array-contract gate.
- [2026-04-18T03:18] [CoordinationDecision] P2 accepted and closed. P3 Batch A1 migrated all contract-compatible block/attr endpoints; `block/transferBlockRef.ts` remains blocked by the array contract gate.
- [2026-04-18T03:27] [CoordinationDecision] P3 advanced through Batches A2→C. Remaining legacy holdouts are array-contract-blocked endpoints plus final bridge removal/docs cleanup in Phase 6.
- [2026-04-18T16:00] [CoordinationDecision] P1 revision 002 landed to support conservative array payload authorization, unblocking Phase 6 Path A.
- [2026-04-18T16:18] [CoordinationDecision] P3 completed Phase 6 holdout migration and removed the legacy classification bridge; rollout implementation is ready for review.
- [2026-04-18T16:54] [CoordinationDecision] P3 sub-change status is now REVIEW; root change moves to REVIEW while awaiting acceptance.

## Milestones

- [2026-04-17T23:49] Design: created the change and drafted first-pass spec/design for endpoint classification and permission redesign.
- [2026-04-18T00:58] Design: converted the change into a root coordinator, narrowed implementation to P1 contracts + P2 demo + P3 rollout, and normalized memory format.
- [2026-04-18T01:17] Design: incorporated latest review follow-ups on P1→P2 amendment loop, read/write independence, endpoint-deny precedence, and reconstructed git baseline.
- [2026-04-18T01:29] Coordination: created P1 sub-change `26-04-18T01-28_p1-core-contracts` and drafted its first-pass spec/design.
- [2026-04-18T01:39] Coordination: P1 implementation finished, validated locally, and moved to review.
- [2026-04-18T02:18] Coordination: P1 review accepted; root advanced to P2-ready state.
- [2026-04-18T02:23] Coordination: created P2 sub-change `26-04-18T02-23_p2-demo-adoption`.
- [2026-04-18T02:33] Coordination: P2 implementation finished, validated locally, and moved to review.
- [2026-04-18T03:00] Coordination: P2 review follow-up completed; root docs and P2 tests now reflect actual 7-endpoint scope.
- [2026-04-18T03:15] Coordination: created P3 rollout sub-change and initialized its design/plan.
- [2026-04-18T03:18] Coordination: P2 closed; P3 Batch A1 implemented and validated locally.
- [2026-04-18T03:27] Coordination: P3 advanced through Batch C and is paused before Phase 6 per user instruction.
- [2026-04-18T16:00] Coordination: P1 revision 002 completed; root now has the contract support needed to start holdout migration in Phase 6.
- [2026-04-18T16:18] Coordination: P3 implementation reached full rollout coverage and is awaiting review before closeout.
- [2026-04-18T16:54] Coordination: root state synchronized to P3 REVIEW status.

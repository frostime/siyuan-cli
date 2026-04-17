# Memory: endpoint-tag-and-permission-model (Root)

**Updated**: 2026-04-18T00:58+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the root change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: unavailable — original malformed `memory.md` did not record immutable baseline data at change creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: unavailable
- HEAD: unavailable
- Worktree: unavailable
- Status Snapshot: unavailable

## Coordination
<!-- Root change authoritative sub-change summary. -->

| Phase | Sub-Change | Status | Blocker |
|-------|------------|--------|---------|
| P1: Core Contracts | (pending) | ⏳ | Waiting for external re-review of current root spec/design |
| P2: Demo Adoption | (pending) | ⏳ | Wait for P1 contract freeze |
| P3: Rollout | (pending) | ⏳ | Wait for P1/P2 results |

## State

Root design has been revised after external audit and is waiting for re-review.
Next: get the current root `spec.md` + `design.md` re-checked, then create the P1 sub-change.
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
- [2026-04-18T00:58] [Gotcha] Original `memory.md` was malformed and lost the immutable git baseline; this corrected file records that loss explicitly instead of reconstructing fake baseline data.

## Milestones

- [2026-04-17T23:49] Design: created the change and drafted first-pass spec/design for endpoint classification and permission redesign.
- [2026-04-18T00:58] Design: converted the change into a root coordinator, narrowed implementation to P1 contracts + P2 demo + P3 rollout, and normalized memory format.

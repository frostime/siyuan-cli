# Memory: p3-rollout

**Updated**: 2026-04-18T15:03+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `refactor/safe-guard`
- HEAD: `30f397e03957dbcdd22118d8ebf9811703b6bce8`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## refactor/safe-guard
```

## State

Batches A1 → C are implemented and validated.
Next: stop before Phase 6 / Batch Z. Phase 6 should follow Path A: amend P1 for array item authorization, migrate holdouts, then remove the legacy bridge.

## Key Files

- `.sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/spec.md` — root phase contract and rollout goal
- `.sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/design.md` — root rollout strategy and bridge-removal intent
- `.sspec/changes/26-04-18T01-28_p1-core-contracts/design.md` — frozen contract boundary that P3 must consume
- `.sspec/changes/26-04-18T02-23_p2-demo-adoption/design.md` — validated demo patterns to reuse during migration
- `src/apis/**` — rollout target surface
- `src/core/registry.ts` — legacy bridge removal target in final batch
- `tests/p3-rollout-batch-a1.test.ts` — Batch A1 regression coverage
- `tests/p3-rollout-batches-a2-to-c.test.ts` — Batch A2→C rollout coverage and holdout assertions

## Knowledge

- [2026-04-18T03:15] [Decision] P3 uses endpoint-group batching to keep each review unit small enough to predict and verify.
- [2026-04-18T03:15] [Constraint] Every migrated endpoint must author `classification` and remove `tags`.
- [2026-04-18T03:15] [Constraint] `mode=read && scope=global` endpoints must retain response guard/filter throughout rollout.
- [2026-04-18T03:15] [Constraint] Array-shaped resource references are a contract gate; P3 must not invent array authorization ad-hoc.
- [2026-04-18T03:15] [Decision] `deriveClassificationFromLegacyTags()` removal is the last batch, never earlier.
- [2026-04-18T03:18] [Constraint] `block/transferBlockRef.ts` remains a known Batch A1 holdout because `refIDs[]` needs array-item authorization, which current P1 contract does not support.
- [2026-04-18T03:27] [Constraint] Additional array-contract holdouts identified: `export/exportResources.ts`, `filetree/getIDsByHPath.ts`, `filetree/moveDocs.ts`, `filetree/moveDocsByID.ts`.
- [2026-04-18T03:27] [VitalFinding] Contract-compatible endpoints across Batches A2→C can be fully migrated without widening P1; only a small set of array-shaped endpoints block Batch Z completion.
- [2026-04-18T15:03] [Decision] Response guard `itemsAt` is evaluated against unwrapped `body.data` returned by `SiyuanClient`, not the raw kernel envelope.
- [2026-04-18T15:03] [Decision] Phase 6 should follow Path A: extend array item authorization first, migrate holdouts, then remove `deriveClassificationFromLegacyTags()`.

## Milestones

- [2026-04-18T03:15] Design+Plan: created P3 rollout change with batching strategy, migration rules, contract gate, and bridge-removal endgame.
- [2026-04-18T03:18] Implement+Validate: completed Batch A1 contract-compatible migrations and passed `pnpm typecheck`, `pnpm build`, `node dist/cli.mjs api list`, `tsx --test tests/p1-core-contracts.test.ts tests/p2-demo-adoption.test.ts tests/p3-rollout-batch-a1.test.ts`.
- [2026-04-18T03:27] Implement+Validate: completed Batches A2→C contract-compatible migrations and passed `pnpm typecheck`, `pnpm build`, `node dist/cli.mjs api list`, `tsx --test tests/p1-core-contracts.test.ts tests/p2-demo-adoption.test.ts tests/p3-rollout-batch-a1.test.ts tests/p3-rollout-batches-a2-to-c.test.ts`.
- [2026-04-18T15:03] Review-Fix+Validate: recorded revision 001, clarified response semantics, added behavioral tests for `insertBlock` and response-shape handling, and reaffirmed the Phase 6 gate.

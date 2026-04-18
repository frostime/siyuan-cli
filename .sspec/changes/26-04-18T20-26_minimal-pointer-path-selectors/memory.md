# Memory: minimal-pointer-path-selectors

**Updated**: 2026-04-19T02:29+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `refactor/safe-guard`
- HEAD: `d338ae011dad803d432044e1440c8f4d2590a115`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## refactor/safe-guard
```

## State
DONE. PointerPath migration, PathProgram runtime, and follow-up boundary fixes are accepted.
Next: any additional selector/runtime work should open a new follow-up change instead of adding more revisions here.

## Key Files
- `.sspec/changes/26-04-18T20-26_minimal-pointer-path-selectors/spec.md` — change scope and key contract decisions
- `.sspec/changes/26-04-18T20-26_minimal-pointer-path-selectors/design.md` — pointer grammar, evaluator behavior, and migration shape
- `src/core/schema.ts` — current `PayloadTargetSpec` / `GuardSpec.response` contract surface
- `src/core/guard.ts` — current `jsonpathGet()` implementation and guard execution flow
- `.sspec/tmp/26-04-18_Claude-jsonpath.md` — external design sketch that motivated this follow-up

## Knowledge
- [2026-04-18T20:26] [Decision] This work is a new independent change, not a P3 cleanup item.
- [2026-04-18T20:26] [Decision] Primary goal is selector-model unification; syntax expansion is only the mechanism.
- [2026-04-18T20:26] [Decision] Migration is intentionally breaking: move directly to `path` rather than supporting `field/isArray` and `path` together.
- [2026-04-18T20:26] [Constraint] New `ResourceKind` values such as `hpath` or `local-path` are outside this change.
- [2026-04-18T20:26] [Constraint] `filterResponse` remains as an escape hatch; this change improves the declarative surface but does not eliminate imperative filtering entirely.
- [2026-04-18T20:35] [Decision] Shared `PointerPath` semantics are unified, but field naming stays contextual: payload uses `path`, response keeps `itemsAt`.
- [2026-04-18T20:45] [Decision] `query.sql`, `getChildBlocks`, and `searchDocs` now use declarative root-array response selectors; `listDocsByPath` stays imperative because it still needs response write-back handling.
- [2026-04-18T22:56] [Decision] Review feedback upgraded the internal selector runtime to PathProgram-style operations: compile once per call, shared get runner, terminal-array filter runner.
- [2026-04-18T22:56] [Decision] Response selector shape mismatches remain fail-loud; this protects the permission filter path from silently accepting unknown kernel response shapes.
- [2026-04-19T00:48] [Constraint] Declarative response filtering supports only one terminal array expansion. Multi-expand shapes like `pages[*].blocks[*]` must fail loud because terminal filter write-back cannot preserve parent ownership after flattening.
- [2026-04-19T00:48] [Decision] Documentation candidates from this change include: fail-loud response shape policy, terminal-filter single-expand boundary, `filterResponse` as escape hatch, payload `path` vs response `itemsAt` naming, and the distinction between selector power and resource-kind semantics.
- [2026-04-19T02:19] [Decision] Real CLI `--dry-run` must share the same guard-first execution path as normal calls. Preview mode belongs in `executeEndpoint()`, not in command-layer shortcuts.
- [2026-04-19T02:19] [Constraint] Declarative `response.itemsAt` is validated at startup against terminal-filter write-back compatibility; invalid shapes fail before any command runs.
- [2026-04-19T02:19] [Decision] Additional documentation candidates include: startup-vs-runtime validation boundaries, dry-run guard ordering, and the difference between read grammar width and write-back-compatible response filter shapes.

## Milestones
- [2026-04-18T20:26] Clarify: confirmed independent change scope, breaking migration mode, and minimal grammar boundary.
- [2026-04-18T20:32] Design: drafted spec/design for `PointerPath`-based selector unification and migration.
- [2026-04-18T20:37] Plan: broke implementation into core engine, schema migration, and regression cleanup phases.
- [2026-04-18T20:49] Implement+Validate: completed PointerPath contract migration, converted eligible root-array response guards, and passed `pnpm typecheck`, `pnpm build`, `node dist/cli.mjs api list`, `tsx --test tests/p1-core-contracts.test.ts tests/p2-demo-adoption.test.ts tests/p3-rollout-batch-a1.test.ts tests/p3-rollout-batches-a2-to-c.test.ts`.
- [2026-04-18T22:56] Review-Fix+Validate: recorded revision 001, replaced temporary write-back helper with terminal filtering, restored root-array warnings, and passed the same targeted regression suite with 37 tests.
- [2026-04-19T00:48] Review-Fix+Validate: recorded revision 002, rejected multi-expand terminal filtering, cleaned helper edge cases, and re-ran targeted regression with 38 passing tests.
- [2026-04-19T02:19] Review-Fix+Validate: recorded revision 003, removed the command-layer dry-run bypass, added startup validation for declarative response write-back shapes, and re-ran targeted regression with 39 passing tests.
- [2026-04-19T02:29] Review: change marked DONE; further selector/runtime evolution must use a new change.

# Memory: p1-core-contracts

**Updated**: 2026-04-18T02:18+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `refactor/safe-guard`
- HEAD: `0e6055c427064a49c986ddd92b2701755b2453f7`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## refactor/safe-guard
```

## State

DONE. P1 core contracts are accepted and closed.
Next: create P2 demo adoption and migrate `block.moveBlock`, `query.sql`, and `file.putFile`.

## Key Files

- `.sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/spec.md` — root phase boundary and locked decisions that P1 must implement
- `.sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/design.md` — authoritative shared-contract target for P1
- `src/core/schema.ts` — type anchor for new endpoint/guard contracts
- `src/core/registry.ts` — normalization bridge + derived meta
- `src/core/permission.ts` — resolver, deny logic, confirmation logic
- `src/core/guard.ts` — async guard pipeline
- `src/core/config.ts` — config v2 shape

## Knowledge

- [2026-04-18T01:29] [Decision] P1 introduces a transitional registry bridge so legacy-tagged endpoint schemas can coexist with new classification-based schemas during rollout.
- [2026-04-18T01:29] [Constraint] P1 must not migrate demo endpoints yet; `moveBlock`, `query.sql`, and `file.putFile` belong to P2.
- [2026-04-18T01:29] [Constraint] Runtime consumers must switch to `RegisteredEndpoint.meta`; they must not read raw `schema.tags` for behavior decisions.
- [2026-04-18T01:29] [Constraint] Config loading is v2-only in alpha; do not spend effort on backward-compat migration shims.
- [2026-04-18T01:39] [Gotcha] Legacy `guard.payload` is kept as a transitional compatibility path; runtime still supports it, but all new work should author `payloadTargets`.
- [2026-04-18T01:39] [VitalFinding] Registry normalization allows P1 to land without bulk endpoint migration; this is the key mechanism that separates P1 from P3 rollout.
- [2026-04-18T02:10] [Decision] Review follow-up is recorded in revision `001-contract-hardening-and-tests`; P1 baseline now includes fail-loud schema validation and targeted contract tests.
- [2026-04-18T02:10] [Gotcha] `pnpm test` currently scans external `temp/siyuan-sdk/node/tests/**` and is unsuitable as a P1 verifier. Use `tsx --test tests/p1-core-contracts.test.ts` for targeted contract validation.

## Milestones

- [2026-04-18T01:29] Design: created P1 sub-change and drafted initial spec/design for core contract freezing.
- [2026-04-18T01:39] Implement+Validate: landed P1 core contracts, then passed `pnpm typecheck`, `pnpm build`, and `node dist/cli.mjs api list`.
- [2026-04-18T02:10] Review-Fix+Validate: completed revision 001, then passed `tsx --test tests/p1-core-contracts.test.ts`.
- [2026-04-18T02:18] Review: Claude accepted P1 after final cleanup; P1 marked DONE.

# Memory: p2-demo-adoption

**Updated**: 2026-04-18T03:00+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `refactor/safe-guard`
- HEAD: `64b3f4199a2d3f197d6f25799eb6c68bbff3e171`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## refactor/safe-guard
```

## State

P2 demo adoption is implemented, amended by revision 001, and re-validated.
Next: review the seven demo migrations plus their guard-path tests; if accepted, mark P2 done and open P3 rollout.
Do not widen the contract surface in P2; any gap returns to P1 amendment.

## Key Files

- `.sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model/design.md` — root P2 target and phase boundary
- `.sspec/changes/26-04-18T01-28_p1-core-contracts/design.md` — frozen contracts consumed by P2
- `src/apis/block/moveBlock.ts` — content write + multi-id demo
- `src/apis/block/getBlockKramdown.ts` — content read + single-id demo
- `src/apis/query/sql.ts` — global read + response filter demo
- `src/apis/file/getFile.ts` — workspace read demo
- `src/apis/file/putFile.ts` — workspace write demo
- `src/apis/system/exit.ts` — runtime invoke + critical override demo
- `src/apis/notification/pushMsg.ts` — runtime invoke + safe override demo

## Knowledge

- [2026-04-18T02:25] [Constraint] P2 validates P1 contracts on representative endpoints only; no contract widening is allowed here.
- [2026-04-18T02:25] [Decision] `moveBlock` remains the multi-id write demo because it exercises the exact bug path that originally motivated the redesign.
- [2026-04-18T02:25] [Decision] `getBlockKramdown` is added as the single-id content-read demo.
- [2026-04-18T02:25] [Decision] `query.sql` remains response-filter-only by design; P2 does not attempt SQL payload analysis or query rewriting.
- [2026-04-18T02:25] [Decision] `file.getFile` + `file.putFile` form the workspace read/write pair; other `file.*` endpoints stay for P3 rollout.
- [2026-04-18T02:25] [Decision] `system.exit` + `pushMsg` form the runtime high-risk / low-risk pair for `riskOverride` validation.
- [2026-04-18T03:00] [Decision] Revision `001-demo-scope-expansion-and-guard-validation` records why P2 expanded from 3 demos to 7 and why that expansion does not widen P1 contracts.
- [2026-04-18T03:00] [VitalFinding] P2 now validates guard execution paths, not only metadata normalization; this is the first end-to-end proof that P1 contracts hold on representative migrated schemas.

## Milestones

- [2026-04-18T02:25] Design: created P2 sub-change and drafted initial spec/design for demo adoption.
- [2026-04-18T02:33] Implement+Validate: migrated seven demo endpoints and passed `pnpm typecheck`, `pnpm build`, `node dist/cli.mjs api list`, `tsx --test tests/p1-core-contracts.test.ts tests/p2-demo-adoption.test.ts`.
- [2026-04-18T03:00] Review-Fix+Validate: recorded revision 001, aligned root docs, and expanded P2 tests from metadata assertions to guard-path checks.

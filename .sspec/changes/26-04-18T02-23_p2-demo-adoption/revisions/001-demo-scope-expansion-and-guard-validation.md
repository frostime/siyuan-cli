---
revision: 1
date: 2026-04-18T02:52:55
trigger: "scope-expansion"
---

# demo scope expansion and guard validation

## Reason
P2 was originally scoped around three demo endpoints (`moveBlock`, `query.sql`, `file.putFile`). During implementation, the demo set was expanded to seven endpoints in order to cover additional categories that the original trio did not exercise explicitly:

- single-id content read
- workspace read
- runtime invoke with high/low risk overrides

The expansion did not introduce any new contract surface beyond P1, but it did change P2's acceptance scope and therefore must be recorded formally. Review also found that the first round of P2 tests only verified metadata normalization, while the design had promised real guard-path validation.

## Changes

### Spec Impact
P2 acceptance scope expands from 3 demo endpoints to 7 representative endpoints:

- `block.moveBlock`
- `block.getBlockKramdown`
- `query.sql`
- `file.getFile`
- `file.putFile`
- `system.exit`
- `notification.pushMsg`

The change remains within the original P2 intent: validate P1 contracts on representative endpoints before P3 rollout. No P1 amendment is required because no new contract field or execution rule is introduced.

### Design Impact
P2 design now explicitly covers:

- content read + write
- global read
- workspace read + write
- runtime invoke with `riskOverride` extremes

Validation depth is also expanded from metadata-only assertions to guard-path checks for deny behavior, response filtering, and dry-run ordering.

### Task Impact
- expand P2 migration tasks from 3 endpoints to 7 endpoints
- add targeted guard execution tests for the migrated demos
- update root documentation references so root and P2 agree on actual coverage

---
revision: 4
date: 2026-04-29T15:41:40
trigger: ""
---

<!-- @RULE: trigger values: review-feedback | discovery | scope-expansion | correction
本文件记录 design gate 后的范围/设计变更。
spec.md 和 design.md 基线不可变，所有后续演化通过此类文件记录。
文件命名：revisions/NNN-description.md（编号递增）。 -->

# unknown-command-cache-hint

## Reason
Review feedback accepted the cache-first extension model but required a clearer failure mode. When users invoke an uncached or stale extension command directly, the CLI currently reports only `Unknown command`, which hides the required next step.

## Changes

### Spec Impact
The current change gains one more acceptance target: when `siyuan api <id>` or `siyuan tool <id>` misses the subcommand table while pending extension metadata exists, the CLI must append an explicit recovery hint to run `siyuan extension cache`.

### Design Impact
No change to command dispatch or cache-first behavior. The implementation stays in the top-level CLI error path:
- keep citty subcommand dispatch unchanged,
- detect `E_UNKNOWN_COMMAND` for `api` and `tool`,
- inspect extension directories for uncached/stale entries,
- append a targeted cache hint when pending metadata exists.

### Task Impact
Add feedback tasks to:
1. expose a small helper for counting pending API/tool extensions,
2. enhance top-level CLI unknown-command handling with a cache hint,
3. add regression coverage for the new hint behavior.

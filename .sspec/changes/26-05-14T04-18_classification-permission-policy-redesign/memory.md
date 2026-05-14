# Memory: classification-permission-policy-redesign

**Updated**: 2026-05-14T20:39+08:00

## Git Baseline (Immutable)

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `feat/优化内置工具`
- HEAD: `2dc30e95551f12e6edb27a770a6350ed1921ea87`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## feat/优化内置工具
?? chat-thread-export.xml
```

## State

Follow-up fixes applied; ready for user review. Pending user decision on invoke/resource-action residual semantics.

## Key Files

- `spec.md` — problem statement, approach, scope, compatibility boundaries.
- `design.md` — classification data model, domain/concern definitions, action mapping, severity, approval gate, validation, recommended permission template.
- `reference/chat-thread-export.xml` — exported conversation that motivated the redesign.
- `reference/destructive-risk-auto-approval-request.md` — observed risk-auto approval issue and reproduction paths.

## Knowledge

- [2026-05-14T04:19+08:00] [Constraint] This is design/planning only. Do not implement until the spec/design have passed user alignment.
- [2026-05-14T04:19+08:00] [Gotcha] Unknown permission rule fields are dangerous: if ignored, a field like `risk: destructive` could become an accidental broad catch-all rule. Validation must be part of any rule expansion.
- [2026-05-14T04:50+08:00] [Decision] Classification core is `action`, `domain`, `concerns`. No `access`, no `mutate`, no `operation`, no `riskOverride`.
- [2026-05-14T04:50+08:00] [Decision] Concern naming: `concerns` avoids collision with permission `effect` in both current and future contexts.
- [2026-05-14T04:50+08:00] [Decision] Severity is a three-tier derived display hint (`low/medium/high`), not a policy gate. It replaces the previous five-tier `risk` model.
- [2026-05-14T04:50+08:00] [Decision] Permission rule surface is unchanged in this phase. Rule field expansion is deferred until the new classification vocabulary stabilises.
- [2026-05-14T05:20+08:00] [Decision] New output should use `severity` and normalized tags; do not keep top-level `risk` or generated `risk:*` tags as compatibility output.
- [2026-05-14T05:20+08:00] [Decision] Legacy compatibility is input-side normalization for old endpoint/extension classification, not output-side risk vocabulary preservation.
- [2026-05-14T05:20+08:00] [Decision] Unknown permission rule field validation must cover global config, workspace config, and project config.
- [2026-05-14T05:20+08:00] [Decision] Recommended permission examples are part of UX/docs; existing workspace permission rules must not be silently modified.
- [2026-05-14T05:30+08:00] [Decision] Permission rule action vocabulary expands to `read|write|invoke`; invocation endpoints are no longer folded into write.
- [2026-05-14T05:30+08:00] [Decision] `raw-sql` is not a concern in this phase; SiYuan SQL API is select-only and does not need a dedicated concern.
- [2026-05-14T05:45+08:00] [Decision] Guard implementation must split endpoint action (`read|write|invoke`) from resource access (`read|write`); invoke maps to write only for resource access.
- [2026-05-14T05:45+08:00] [Decision] Severity derivation has a medium fallback for unlisted action/domain combinations.
- [2026-05-14T05:45+08:00] [Decision] Incompatible extension classification cache should hard-fail with recache guidance rather than silently register stale semantics.
- [2026-05-14T20:39+08:00] [Fact] Upstream SiYuan kernel `kernel/api/block.go#getBlockKramdowns` reads `arg["mode"]`; payload field should stay `mode` (not `action`).
- [2026-05-14T20:39+08:00] [Risk] Runtime Phase 2 currently sets permission context action from resource access (`read|write`), so resource-scoped `action: invoke` rules cannot match; user confirmation required before semantic change.

## Milestones

- [2026-05-14T04:19+08:00] Created change, copied conversation and reference materials, and filled initial spec/design for alignment.
- [2026-05-14T04:50+08:00] Clean-slate rewrite of spec/design — `action/domain/concerns`, three-tier severity, no legacy wrapper types.
- [2026-05-14T05:20+08:00] Refined spec/design: removed ambiguous risk compatibility, added project-config validation, implicit-workspace warning rule, extension cache recache behavior, and recommended permission template.
- [2026-05-14T05:30+08:00] Refined spec/design: removed invoke-to-write permission folding and removed `raw-sql` concern.
- [2026-05-14T05:45+08:00] Ran subagent design review, accepted key spec-level fixes, and created phase-based tasks.md.
- [2026-05-14T06:30+08:00] Implemented classification/permission policy redesign across schema, registry, guard, endpoint schemas, config validation, extension cache, workspace template, docs, and tests. Verification passed: `pnpm run typecheck`, `pnpm test`, `pnpm run build`, manual `api list --tag severity:high`.
- [2026-05-14T20:39+08:00] Follow-up patch: restored `block.getBlockKramdowns` payload `mode`, made API/extension list show stale/uncached/incompatible cache status as pending metadata, refreshed outdated approval/risk comments, and added regression assertion for `mode` field. Verification passed: `pnpm exec tsx --test tests/endpoint-schemas.test.ts tests/extension-system.test.ts`, `pnpm run typecheck`, `pnpm exec tsx src/cli.ts api list --group system`, `pnpm exec tsx src/cli.ts extension list`.

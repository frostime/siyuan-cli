---
change: "behavior-config"
---

# Memory: behavior-config

## State
- Phase: Review (implementation complete, awaiting user review)

## Milestones
- [2026-04-26T18:02] Change created, spec.md + design.md drafted
- [2026-04-26T18:15] Design approved, schema bump removed, docs scope added, tasks.md written
- [2026-04-26T18:20] Implementation complete: 4 source files + 4 doc files updated, tsc clean, approval tests pass
- [2026-04-26T18:35] Code review (gpt-5.4) found 2 critical issues, fixed:
  1. resolveWorkspace() omitted entry.behavior — workspace layer was skipped
  2. Validation ran after normalizeBehavior() — invalid shapes silently collapsed
  Also: extracted shared validateBehaviorRaw() to schema.ts, added ResolvedBehaviorConfig type, added source to YES_BYPASSED notice

## Knowledge
- User wants 3 fields: `allowYes`, `approval.timeout`, `approval.autoOpen`
- Scope: Global (with workspace-level) + Project override
- User asked about renaming `--yes` → recommended keeping `--yes` (convention)
- Follows the same override model as `permission`: Project > Workspace > Defaults > Built-in
- No schema bump — behavior is optional, backward compatible
- `ResolvedWorkspace` carries `effectiveBehavior` from project config
- `ExecuteOptions` now carries `config` for behavior resolution in guard.ts

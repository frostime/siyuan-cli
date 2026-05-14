---
change: "classification-permission-policy-redesign"
updated: "2026-05-14T05:45+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Core classification model + registry normalization ⏳
- [ ] Update `src/shared/schema.ts` with new classification, concern, cardinality, severity, `PermissionRule.action`, `PermissionContext.action`, and `DerivedMeta` types per design.
- [ ] Update `src/api/registry.ts` to normalize legacy `mode/surface/scope` classification into `action/domain/concerns/cardinality` and derive `severity`.
- [ ] Update `src/api/registry.ts` tag generation to emit normalized tags only.
- [ ] Add or update registry/type tests covering legacy normalization, endpoint-specific overrides, severity fallback, and tag output.
**Verification**: `pnpm run typecheck`; registry tests pass; `api list` can still load all built-in endpoints through legacy normalization.

### Phase 2: Permission and guard behavior ⏳
- [ ] Update `src/api/guard.ts` to split `endpointAction` (`read|write|invoke`) from `resourceAccess` (`read|write`).
- [ ] Update `src/api/guard.ts` to remove risk-auto approval and trigger approval only from caller/resource permission effects.
- [ ] Update `src/api/guard.ts` approval trigger reason text and `IMPLICIT_WORKSPACE` warning per design.
- [ ] Update `src/shared/permission.ts` types/usages as needed for `invoke` action matching while keeping resource access `read|write`.
- [ ] Add or update guard/permission tests for `action: invoke`, `action: write` not matching invoke, wildcard rules matching invoke, and no risk-auto approval.
**Verification**: `pnpm run typecheck`; relevant permission/guard tests pass; dry-run output reports approval only from explicit permission sources.

### Phase 3: Permission config validation ⏳
- [ ] Add shared permission rule unknown-field validation helper in `src/shared/schema.ts` or a focused shared module.
- [ ] Apply validation in `src/workspace/config.ts` before permission normalization for defaults and workspace configs.
- [ ] Apply validation in `src/workspace/project-config.ts` before returning project permission config.
- [ ] Add tests for unknown fields in global/workspace/project permission rules, including `risk`.
**Verification**: invalid configs fail with `CONFIG_PARSE_ERROR` / `PROJECT_CONFIG_PARSE_ERROR`; valid existing configs still load.

### Phase 4: CLI output, extension cache, and workspace UX ⏳
- [ ] Update `src/api/command.ts` list/describe output and tag help from `risk/mode/surface/scope` to `severity/action/domain/cardinality/concern`.
- [ ] Update `src/extension/cache.ts` to handle normalized classification and fail incompatible cache with recache guidance.
- [ ] Update `src/workspace/command.ts` to add/expose recommended permission template without silently modifying existing rules.
- [ ] Add or update tests/manual checks for `api list --tag severity:high`, stale/incompatible extension cache guidance, and workspace template output.
**Verification**: `pnpm run typecheck`; CLI list/describe no longer outputs top-level `risk`; incompatible extension cache prompts recache.

### Phase 5: Built-in endpoint migration ⏳
- [ ] Migrate built-in endpoint schemas under `src/api/endpoints/**` to `action/domain/concerns/cardinality`.
- [ ] Review endpoint-specific classifications for `system.getConf`, notification endpoints, file endpoints, network proxy, system exit, and query SQL.
- [ ] Ensure no built-in endpoint still authors `mode/surface/scope/operation/riskOverride`.
**Verification**: `rg "mode:|surface:|scope:|operation:|riskOverride" src/api/endpoints` returns no authored classification leftovers; `pnpm run typecheck`; endpoint registry loads all built-ins.

### Phase 6: Docs and spec-docs ⏳
- [ ] Update `.sspec/spec-docs/endpoint-schema.md` for new classification, severity, tags, and extension cache behavior.
- [ ] Update `.sspec/spec-docs/permission-model.md` for explicit approval semantics, `invoke` action, and unknown rule validation.
- [ ] Update `src/docs/**` and `skills/siyuan-cli/SKILL.md` for explicit approval rules and recommended permission examples.
- [ ] Update release/user-facing notes where needed for `action: invoke` rule behavior and removal of `risk` output.
**Verification**: docs contain no stale risk-auto approval guidance; docs show explicit `action: invoke` approval examples.

---

## Progress

**Overall**: 0%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 0/4 | ⏳ |
| Phase 2 | 0/5 | ⏳ |
| Phase 3 | 0/4 | ⏳ |
| Phase 4 | 0/4 | ⏳ |
| Phase 5 | 0/3 | ⏳ |
| Phase 6 | 0/4 | ⏳ |

**Recent**:
- 2026-05-14T05:45+08:00: Planned implementation phases after design review; no code changes yet.

---
change: "behavior-config"
updated: "2026-04-26"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Type & Config Layer ✅
- [x] Add `BehaviorConfig` interface to `src/core/schema.ts` per design.md §2
- [x] Add `behavior?` field to `WorkspaceEntry` and `AppConfig.defaults` in `src/core/config.ts`
- [x] Implement `resolveEffectiveBehavior()` in `src/core/config.ts` per design.md §3
- [x] Update `normalizeConfig()` to include `behavior` in workspace normalization
- [x] Update `renderConfigYaml()` header comments to document behavior defaults
- [x] Add `behavior?` field to `ProjectConfig` in `src/utils/project-config.ts`
- [x] Add `'behavior'` to `ALLOWED_TOP_LEVEL` in `src/utils/project-config.ts`
- [x] Add `behavior` validation in `loadProjectConfig()` (type checks per design.md §4)
- [x] Add `behavior` validation in `loadConfig()` (type checks per design.md §4)
- [x] Export `BehaviorConfig` from `src/core/config.ts` (re-export from schema)
- [x] Add `effectiveBehavior` to `ResolvedWorkspace` + `resolveEffectiveWorkspace()`
**Verification**: `tsc --noEmit` passes ✅

### Phase 2: Guard Integration ✅
- [x] In `src/core/guard.ts` `executeEndpoint()`: resolve effective behavior from config + workspace + project
- [x] Gate `--yes` on `behavior.allowYes` — when false, treat `yes` as absent, write `YES_BYPASSED` notice
- [x] Pass `behavior.approval.timeout` to `buildPreparedApprovalRequest()`
- [x] Pass `behavior.approval.autoOpen` to `requestAndWait()`
- [x] Add `config` to `ExecuteOptions` + pass from callers (`api.ts`, `tools.ts`)
**Verification**: `tsc --noEmit` passes ✅

### Phase 3: Documentation ✅
- [x] `src/docs/cli-usage/config-and-permission.md`: add `## Behavior` section after Permission rules per design.md §8
- [x] `src/docs/cli-usage/config-and-permission.md`: update config structure example to include `behavior`
- [x] `src/docs/cli-usage/config-and-permission.md`: update project config example to include `behavior`
- [x] `src/docs/cli-usage/cli-overview.md`: update `--yes` flag row to note `allowYes` control
- [x] `src/docs/cli-usage/cli-overview.md`: update Approval Center paragraph (configurable timeout)
- [x] `src/docs/cli-usage/cli-overview.md`: update `CONFIRMATION_REQUIRED` error description
- [x] `src/docs/README.md`: update "Write safety" bullet
- [x] `src/docs/recipes/edit-content.md`: update "approval required" recovery section
**Verification**: `tsc --noEmit` passes; 4 doc files updated ✅

### Phase 4: Smoke Test ✅
- [x] Add behavior config smoke test in `loadConfig()`: warn on unknown keys inside `behavior`
- [x] Verify existing tests pass (`npm test`) — approval tests green, pre-existing failures unrelated
- [ ] Manual end-to-end: config with `allowYes: false` + `--yes` → approval flow runs (requires running kernel)
**Verification**: `tsc --noEmit` passes ✅; approval tests pass ✅; pre-existing failures unrelated ✅

---

## Progress
<!-- @REPLACE -->

**Overall**: 95% (manual e2e pending kernel)

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 95% | ✅ (manual e2e pending) |

**Recent**:
- [2026-04-26] All 4 phases implemented, TypeScript compiles, approval tests pass

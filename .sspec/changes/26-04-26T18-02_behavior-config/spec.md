---
name: behavior-config
status: PLANNING
change-type: single
created: 2026-04-26T18:02:46
reference:
  - source: .sspec/changes/26-04-26T00-34_confirm-human-approval-channel
    type: prev-change
    note: "Follow-up: add config-level control over approval behavior"
---

# behavior-config

## Problem Statement

The approval channel (confirm-human-approval-channel) hardcodes two behavioral assumptions: `--yes` always bypasses confirm, and approval timeout is always 60s. In managed environments — CI pipelines shared across teams, project repos with safety policies, agent sandboxes where unattended writes are risky — operators need to enforce "no `--yes` bypass" and customize approval timeouts per-workspace or per-project, without forking the code.

Currently there is zero config surface for behavioral settings. The only control is the permission rule engine (`allow/deny/confirm`), which governs *whether* an endpoint is gated but not *how* the gate behaves once triggered.

## Proposed Solution

### Approach

Add a `behavior` section to both global and project config, following the same override model as `permission`: project-level overrides workspace-level, which overrides defaults, which overrides built-in constants.

Three fields at launch:
- **`allowYes`** — when `false`, `--yes` flag is ignored and the approval flow is mandatory for confirm-gated writes.
- **`approval.timeout`** — approval request timeout in seconds (replaces the hardcoded 60s).
- **`approval.autoOpen`** — whether to auto-open the Approval Center browser tab.

This is a pure config-layer addition. No new modules, no new CLI commands, no new transport. The guard.ts integration point is a 5-line change.

### Key Change

**Feat A: BehaviorConfig type** — Define `BehaviorConfig` interface with `allowYes`, `approval.timeout`, `approval.autoOpen`. Add it to `AppConfig.defaults`, `WorkspaceEntry`, and `ProjectConfig`.

**Feat B: Resolution function** — Add `resolveEffectiveBehavior(config, workspaceName, projectBehavior?)` that merges Project → Workspace → Defaults → Built-in. Returns a fully-populated `BehaviorConfig` (no optional fields).

**Feat C: Guard integration** — In `executeEndpoint()`, before the `wouldConfirm && !yes` branch, resolve effective behavior. If `allowYes === false`, treat `--yes` as absent. Pass `approval.timeout` and `approval.autoOpen` through to `requestAndWait()`.

**Feat D: YAML rendering update** — `renderConfigYaml()` includes the `behavior` section in output. Project config's `ALLOWED_TOP_LEVEL` set gains `behavior`.

**Feat E: Documentation** — Update agent-facing docs to cover `behavior` config, `allowYes` semantics, configurable approval timeout, and `autoOpen` control.

### Scope Summary

| File | Change |
|------|--------|
| `src/core/schema.ts` | Add `BehaviorConfig` interface |
| `src/core/config.ts` | Add `behavior` to `AppConfig.defaults` and `WorkspaceEntry`; add `resolveEffectiveBehavior()`; update `renderConfigYaml()` |
| `src/utils/project-config.ts` | Add `behavior` to `ProjectConfig`; update `ALLOWED_TOP_LEVEL` |
| `src/core/guard.ts` | Resolve behavior; gate `--yes` on `allowYes`; pass timeout/autoOpen to approval |
| `src/docs/cli-usage/config-and-permission.md` | New `Behavior` section: field spec, merge precedence, examples |
| `src/docs/cli-usage/cli-overview.md` | Update `--yes` flag description, Approval Center section, error codes |
| `src/docs/README.md` | Update "Write safety" bullet to mention `allowYes` |
| `src/docs/recipes/edit-content.md` | Update "approval required" recovery to note `allowYes` |

### Design Reference

→ 详细技术设计见 [design.md](./design.md)

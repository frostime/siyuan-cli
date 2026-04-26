---
change: "behavior-config"
created: 2026-04-26T18:02:46
---

# Design: behavior-config

## 1. User-visible outcome

### Scenario A: Project forbids `--yes`

Agent (or human) runs a write command in a repo with `.siyuan-cli.yaml` containing `behavior.allowYes: false`.

```text
$ siyuan api block.deleteBlock --id 202604260001 --yes

  → CLI ignores --yes (allowYes: false)
  → opens Approval Center automatically
  → terminal: "⏳ Waiting for approval (30s timeout)..."
  → human approves in browser
  → command executes
```

If `--yes` is passed and `allowYes` is `false`, the CLI writes a structured notice to stderr:

```json
{"notice":"YES_BYPASSED","reason":"behavior.allowYes is false, --yes ignored"}
```

No error. Silent downgrade. The approval flow runs normally.

### Scenario B: Custom timeout

Workspace config sets `behavior.approval.timeout: 10`.

```text
$ siyuan api block.deleteBlock --id 202604260001

  → approval request created with 10s timeout
  → terminal: "⏳ Waiting for approval (10s timeout)..."
  → if no decision in 10s → APPROVAL_TIMEOUT error
```

### Scenario C: Auto-open disabled

Project config sets `behavior.approval.autoOpen: false`.

```text
$ siyuan api block.deleteBlock --id 202604260001

  → approval request created
  → terminal prints URL: "Open manually: http://127.0.0.1:4312/approval?token=..."
  → terminal: "⏳ Waiting for approval (60s timeout)..."
  → no browser tab opens
```

### Scenario D: All defaults (no behavior config)

Identical to today. `--yes` works, 60s timeout, browser auto-opens.

## 2. Data architecture

### BehaviorConfig type

```ts
export interface BehaviorConfig {
  allowYes?: boolean;              // default: true
  approval?: {
    timeout?: number;              // seconds, default: 60
    autoOpen?: boolean;            // default: true
  };
}
```

All fields optional at declaration. `resolveEffectiveBehavior()` returns a fully-populated object.

### Config locations

```yaml
# Global config (~/.config/siyuan-cli/config.yaml)
schemaVersion: 1
current: main
workspaces:
  main:
    baseUrl: http://localhost:6806
    token: xxx
    behavior:                      # workspace-level (optional)
      allowYes: false
      approval:
        timeout: 30
defaults:
  behavior:                        # global default (optional)
    allowYes: true
    approval:
      timeout: 60
      autoOpen: true
  permission: { ... }
```

```yaml
# Project config (.siyuan-cli.yaml)
schemaVersion: 1
workspace: main
behavior:                          # project-level override (optional)
  allowYes: false
  approval:
    timeout: 15
    autoOpen: false
permission: { ... }
```

### Merge precedence

```text
Project (.siyuan-cli.yaml)
  ↓ field-level fallback
Workspace (workspaces[name].behavior)
  ↓ field-level fallback
Defaults (defaults.behavior)
  ↓ field-level fallback
Built-in constant
```

Merge is **field-level**, not object-level. A project setting `allowYes: false` without touching `approval` still inherits `approval.timeout` from workspace or defaults.

## 3. Interface contract

### resolveEffectiveBehavior

```ts
const BUILT_IN_BEHAVIOR: Required<BehaviorConfig> = {
  allowYes: true,
  approval: { timeout: 60, autoOpen: true }
};

export function resolveEffectiveBehavior(
  defaults: BehaviorConfig | undefined,
  workspace: BehaviorConfig | undefined,
  project: BehaviorConfig | undefined
): Required<BehaviorConfig> {
  return {
    allowYes:
      project?.allowYes ??
      workspace?.allowYes ??
      defaults?.allowYes ??
      BUILT_IN_BEHAVIOR.allowYes,
    approval: {
      timeout:
        project?.approval?.timeout ??
        workspace?.approval?.timeout ??
        defaults?.approval?.timeout ??
        BUILT_IN_BEHAVIOR.approval.timeout,
      autoOpen:
        project?.approval?.autoOpen ??
        workspace?.approval?.autoOpen ??
        defaults?.approval?.autoOpen ??
        BUILT_IN_BEHAVIOR.approval.autoOpen
    }
  };
}
```

### Guard integration (guard.ts)

```ts
// Current code:
if (wouldConfirm && !yes) {
  await requestAndWait(preparedRequest);
}

// New code:
const behavior = resolveEffectiveBehavior(
  config.defaults?.behavior,
  config.workspaces[workspaceName]?.behavior,
  projectBehavior          // from resolvedWorkspace.effectiveBehavior
);

const effectiveYes = yes && behavior.allowYes;

if (wouldConfirm && !effectiveYes) {
  if (yes && !behavior.allowYes) {
    process.stderr.write(JSON.stringify({
      notice: 'YES_BYPASSED',
      reason: 'behavior.allowYes is false, --yes ignored'
    }) + '\n');
  }
  const prepared = buildPreparedApprovalRequest({
    workspaceName: workspace.name,
    entry,
    payload,
    ...(callerTool ? { callerTool } : {}),
    timeoutSec: behavior.approval.timeout
  });
  await requestAndWait(prepared, {
    autoOpen: behavior.approval.autoOpen
  });
}
```

### Project config changes

`ProjectConfig` gains a `behavior` field:

```ts
export interface ProjectConfig {
  schemaVersion: number;
  workspace?: string;
  permission?: PermissionConfig;
  behavior?: BehaviorConfig;       // NEW
}
```

`ALLOWED_TOP_LEVEL` set: add `'behavior'`.

## 4. Behavioral flow

### Decision tree in executeEndpoint()

```text
wouldConfirm?
  ├─ NO  → execute directly
  └─ YES → resolve behavior
        ├─ allowYes=true AND --yes passed → execute directly
        ├─ allowYes=false AND --yes passed
        │     → write YES_BYPASSED notice
        │     → fall through to approval
        └─ no --yes (or --yes ignored)
              → build request with behavior.approval.timeout
              → requestAndWait({ autoOpen: behavior.approval.autoOpen })
              ├─ approved → execute
              ├─ rejected → throw APPROVAL_REJECTED
              ├─ timed_out → throw APPROVAL_TIMEOUT
              └─ cancelled → throw APPROVAL_CANCELLED
```

### Config validation

`loadConfig()` and `loadProjectConfig()` validate `behavior` fields:

| Field | Validation | Error |
|-------|-----------|-------|
| `allowYes` | must be boolean if present | `CONFIG_PARSE_ERROR` |
| `approval.timeout` | must be positive integer | `CONFIG_PARSE_ERROR` |
| `approval.autoOpen` | must be boolean if present | `CONFIG_PARSE_ERROR` |
| `approval` | must be object if present | `CONFIG_PARSE_ERROR` |

Unknown keys inside `behavior` → soft warning (forward compat, same as permission).

## 5. UX: config editing

Alpha-stage: manual YAML editing only. No `siyuan config set` command.

### Example: enforce no `--yes` for a project

```yaml
# .siyuan-cli.yaml at repo root
schemaVersion: 1
workspace: production
behavior:
  allowYes: false
  approval:
    timeout: 30
```

### Example: global default with longer timeout

```yaml
# ~/.config/siyuan-cli/config.yaml
schemaVersion: 1
defaults:
  behavior:
    approval:
      timeout: 120
```

### Example: workspace override for CI

```yaml
# ~/.config/siyuan-cli/config.yaml
schemaVersion: 1
workspaces:
  ci-agent:
    baseUrl: http://localhost:6806
    token: xxx
    behavior:
      allowYes: true        # CI agent trusts --yes
      approval:
        autoOpen: false     # no browser in CI
```

## 6. Rendered config example

`renderConfigYaml()` output with behavior:

```yaml
# siyuan-cli config
#
# Global defaults:
# - permission.default: allow
# - add deny/confirm rules to restrict access
# - behavior.allowYes: true (--yes bypasses confirm)
# - behavior.approval.timeout: 60 (seconds)
# - behavior.approval.autoOpen: true (open browser on confirm)
schemaVersion: 1
current: main
workspaces:
  main:
    baseUrl: http://localhost:6806
    permission:
      default: allow
      rules: []
  ci-agent:
    baseUrl: http://localhost:6806
    token: "xxx"
    behavior:
      allowYes: true
      approval:
        autoOpen: false
    permission:
      default: allow
      rules: []
defaults:
  behavior:
    allowYes: true
    approval:
      timeout: 60
      autoOpen: true
  permission:
    default: allow
    rules: []
```

## 7. Error messages

| Scenario | Error/Notice | Message |
|----------|-------------|---------|
| `--yes` passed, `allowYes: false` | `YES_BYPASSED` (stderr notice) | `"behavior.allowYes is false, --yes ignored"` |
| `allowYes` not boolean | `CONFIG_PARSE_ERROR` | `"behavior.allowYes must be a boolean"` |
| `approval.timeout` not positive int | `CONFIG_PARSE_ERROR` | `"behavior.approval.timeout must be a positive integer"` |
| `approval.timeout` not positive int (project) | `PROJECT_CONFIG_PARSE_ERROR` | same pattern |
| Unknown key in `behavior` | `UNKNOWN_BEHAVIOR_KEY` (stderr warning) | `"Unknown key \"behavior.xxx\" in config"` |

## 8. Documentation changes

Four agent-facing doc files need updates.

### `config-and-permission.md`

Add a `## Behavior` section after `## Permission rules`, covering:

```markdown
## Behavior

Optional `behavior` section controls how the CLI handles confirm-gated writes.

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `allowYes` | boolean | `true` | When `false`, `--yes` flag is ignored; approval flow is mandatory |
| `approval.timeout` | number (seconds) | `60` | How long the CLI waits for an approval decision |
| `approval.autoOpen` | boolean | `true` | Whether to auto-open the Approval Center in the browser |

### Merge precedence

Project > Workspace > Defaults > Built-in.

Merge is field-level: a project setting only `allowYes` still inherits `approval.timeout` from workspace or defaults.

### Example

```yaml
defaults:
  behavior:
    allowYes: true
    approval:
      timeout: 60
      autoOpen: true
```
```

Also update:
- Config structure example: add `behavior` to `defaults` and workspace
- Project config example: add `behavior` block
- Risk-based auto-confirmation note: add "This can now be controlled via `behavior.approval.timeout` and `behavior.approval.autoOpen`."

### `cli-overview.md`

| Location | Change |
|----------|--------|
| `--yes` flag row | Add note: "ignored when `behavior.allowYes` is `false`" |
| Approval Center paragraph | Change "up to 60 seconds" → "up to `behavior.approval.timeout` seconds (default 60)" |
| `CONFIRMATION_REQUIRED` error | Add: "or set `behavior.allowYes: false` to enforce approval" |
| Agent error handling pattern | Update `CONFIRMATION_REQUIRED` line to mention `allowYes` |

### `README.md`

Update bullet:
```markdown
- **Write safety**: `--dry-run` to preview, `--yes` to confirm destructive operations. Set `behavior.allowYes: false` in config to enforce the approval flow.
```

### `edit-content.md`

Update "Write denied or approval required" recovery section:
```markdown
- retry with `--yes` only when the action is intended and safe
- if `behavior.allowYes` is `false`, `--yes` is disabled; approve via the Approval Center instead
```

## 9. What stays unchanged

| Module | Reason |
|--------|--------|
| `src/core/permission.ts` | Permission evaluation still decides `wouldConfirm`; behavior only controls what happens after |
| `src/core/tools.ts` | Tools inherit behavior through `executeEndpoint()` |
| `src/approval/broker.ts` | Broker is stateless w.r.t. client behavior config |
| `src/approval/store.ts` | Store doesn't care about timeout or allowYes |
| `src/approval/command.ts` | CLI approval commands are operational, not behavioral |
| `src/commands/api.ts` | Command handler passes args through; behavior resolved inside guard |

## 10. Reserved for later

```text
- `behavior.confirmMode: 'approval' | 'error' | 'auto'` (fallback when no broker)
- `behavior.approval.maxConcurrent` (limit simultaneous approvals)
- per-endpoint behavior overrides
- `siyuan config set behavior.allowYes false` (CLI config editing command)
```

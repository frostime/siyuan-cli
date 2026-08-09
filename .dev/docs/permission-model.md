---
name: permission-model
description: "Permission engine architecture: rule-list model, two-phase evaluation, tool-level enforcement, bypassPermission, rule cascade, project override semantics, and approval effect semantics."
updated: 2026-05-15
scope:
  - /src/shared/permission.ts
  - /src/api/guard.ts
  - /src/shared/schema.ts
  - /src/tool/command.ts
  - /src/tool/registry.ts
  - /src/workspace/config.ts
  - /src/workspace/resolve.ts
  - /src/workspace/project-config.ts
deprecated: false
replacement: ""
---

# Permission Model

## Overview

The permission system is a **unified rule-list model**: a flat ordered list of rules evaluated top-to-bottom, first full match wins. There is no "deny beats allow" override — order is the only priority mechanism.

Rules are assembled from config layers and evaluated by `PermissionEngine` in `/src/shared/permission.ts`. The engine is constructed once per invocation and reused across caller-level and resource-level checks.

Endpoint classification is metadata. Approval is triggered by explicit permission effects, not by derived severity.

---

## Rule structure

Each rule has optional conditions and a mandatory effect:

| Field | Match method | Omitted means |
|-------|-------------|---------------|
| `endpoint` | glob (micromatch) on endpoint id | any endpoint |
| `tool` | glob (micromatch) on tool id | any tool (or no tool) |
| `action` | exact: `read` \| `write` \| `invoke` | any action |
| `notebook` | exact match on notebook id | any notebook |
| `path` | glob (micromatch) on SiYuan id-based path | any path |
| `root_id` | convenience alias, normalized to `path: "**/<id>.sy"` | any root |
| `effect` | — | **required**: `allow` \| `deny` \| `approval` |
| `note` | — | ignored; human annotation |

A rule with no conditions matches every context — useful as a final catch-all.

**`root_id` is a convenience alias.** When set, it is normalized to `path: "**/<root_id>.sy"` during config loading. If both `root_id` and `path` are set, a `ROOT_ID_OVERRIDES_PATH` warning is emitted and `root_id` takes precedence. `root_id` values missing the `.sy` suffix trigger a `LIKELY_PATH_MISSING_SY_SUFFIX` warning.

**`notebook` and `path` only accept ID-based values**, not hpaths. Reason: hpaths are mutable (renaming a document changes its hpath), while IDs are stable. The engine does not resolve hpaths. A smoke-test warning (`LIKELY_HPATH_NOT_ID`, `LIKELY_HPATH_NOT_ID_IN_PATH`) is emitted on config load when a value looks like an hpath.

**Unknown rule fields are hard errors.** Global config, workspace config, and project config validate rule keys before normalization. This prevents a typo or unsupported condition such as `risk: high` from being silently ignored and turning the rule into a broad match.

Code refs: `/src/shared/schema.ts#PermissionRule`, `/src/shared/schema.ts#validatePermissionRulesRaw`, `/src/workspace/config.ts#loadConfig`, `/src/workspace/project-config.ts#loadProjectConfig`.

---

## Rule cascade

Without a project override, the final rule list and default effect are assembled from the global config:

```text
final rules   = workspace.rules ++ defaults.rules
final default = workspace.default ?? defaults.default ?? "allow"
```

Implemented in `cascadePermission()` in `/src/shared/permission.ts`.

When project permission exists, project rules are prepended before workspace/default rules:

```text
final rules   = project.rules ++ workspace.rules ++ defaults.rules
final default = project.default ?? workspace.default ?? defaults.default ?? "allow"
```

Because evaluation is first-match-wins, project rules shadow workspace/defaults rules for any context they cover. Workspace/defaults rules remain in the list and still apply to contexts the project rules did not match.

The project `permission` block is **independent of how the workspace name was determined**. If `--workspace prod` overrides the workspace but a `.siyuan-cli.yaml` is found in cwd, the project's permission still applies. Rationale: `--workspace` expresses "use a different target", while the project file expresses "in this directory, these rules apply" — they are orthogonal.

Code refs: `/src/shared/permission.ts#cascadePermission`, `/src/workspace/resolve.ts#resolveEffectiveWorkspace`.

---

## Action semantics

Permission action uses endpoint classification action:

```text
classification.action: read   -> permission action: read
classification.action: write  -> permission action: write
classification.action: invoke -> permission action: invoke
```

`invoke` is not folded into `write` for permission rule matching. A rule with `action: write` matches write endpoints only. A rule without `action` matches all actions.

Resource access (`guard.payloadTargets[*].access`) remains `read | write` and describes the resource operation direction, but does not determine the permission action passed to the engine. Endpoint `action` (`read | write | invoke`) is used for both caller-level (Phase 1) and resource-level (Phase 2) rule matching.

Code refs: `/src/api/guard.ts#executeEndpoint`, `/src/api/guard.ts#applyPayloadGuard`, `/src/shared/permission.ts#matchesCaller`.

---

## Two-phase evaluation

Permission checks are split into two phases because the available context differs at each point in the execution pipeline.

### Phase 1 — caller gate (`checkEndpoint` / `checkTool`)

Called before the kernel request. Only caller info is available: `endpoint`, `tool`, `action`.

Three outcomes:

1. **A pure-caller deny rule matches** (rule has no `notebook`/`path` conditions) → throw `EndpointDeniedError` immediately.
2. **Only resource-qualified rules match this caller** → defer; Phase 2 will decide once resource info is available. Default is NOT applied here.
3. **No rules match** → apply default. If default is `deny`, throw immediately.

"Pure-caller" means the rule has no `notebook` or `path` conditions. Such rules produce immediate verdicts in Phase 1.

### Phase 2 — resource gate (`checkContentRef` / `filterItems`)

Called from `applyPayloadGuard` in `/src/api/guard.ts`, once per `payloadTarget` declared in the endpoint schema. Full context is available: `endpoint`, `tool`, `action`, `notebook`, `path`.

- Runs `evaluateVerbose()` against the full rule list (same list as Phase 1 — no separation).
- If effect is `deny` → throw `ContentDeniedError`.
- If effect is `allow` or `approval` → pass through. Approval is handled separately in the approval gate.

**Phase 2 only runs if the endpoint declares `payloadTargets`.** If an endpoint has no `payloadTargets`, resource-qualified rules targeting that endpoint's resources are never evaluated. The endpoint schema author is responsible for declaring `payloadTargets` for endpoints where resource-level rules should apply.

---

## Tool-level permission enforcement

Tools call endpoints internally via `ctx.callEndpoint()`. Without tool-level guards, permission enforcement happens inside each endpoint call — but tools cannot distinguish "resource not found" from "resource denied" when the response filter silently removes results.

Three mechanisms address this, from declarative to imperative:

### Declarative: `ToolSchema.guard.payloadTargets`

Same schema as endpoint `payloadTargets`, declared on the tool. Evaluated by `tool/command.ts` before `run()` is called.

```ts
// src/tool/builtins/locate-block.ts
guard: {
    payloadTargets: [
        { path: 'id', kind: 'id', access: 'read', skipEmpty: true }
    ]
}
```

Use when the tool's input schema has a direct field referencing a protected resource. `skipEmpty: true` is required for optional fields — when the field is empty, the guard is skipped and the tool runs without resource-level restriction.

### Imperative: inline `ctx.permission.checkContentRef()` in `run()`

Use when:
- The resource reference is embedded in a JSON string field (e.g. `update-block`'s `blocks` is a JSON array string containing IDs)
- The entry field is polymorphic (e.g. `list-doc-tree`'s `entry` can be a notebook ID or a document ID)

```ts
// Polymorphic example: try as block ID, fall back to notebook ID
try {
    await ctx.permission.checkContentRef(
        { kind: 'id', value: entry, access: 'read' },
        { tool: 'list-doc-tree' }
    );
} catch (e) {
    if (e instanceof BlockNotFoundError) {
        await ctx.permission.checkContentRef(
            { kind: 'notebook', value: entry, access: 'read' },
            { tool: 'list-doc-tree' }
        );
    } else throw e;
}
```

Write tools MUST check both `read` and `write` access — a `deny read` rule implies the tool cannot even inspect the resource.

### `bypassPermission` on `callEndpoint`

After a tool performs its own permission check, subsequent internal API calls should not be re-evaluated by the endpoint permission pipeline. Otherwise:
- Response filter silently removes results → tool reports "not found" instead of "denied"
- Double permission evaluation is redundant and can produce confusing error messages

```ts
const rows = await ctx.callEndpoint<Row[]>('query.sql', { stmt }, { bypassPermission: true });
```

`bypassPermission: true` skips Phase 1 (checkEndpoint), Phase 2 (applyPayloadGuard), approval gate evaluation, and response filtering. It preserves: payload validation, debug output, and dry-run semantics.

Use only after the tool has already performed its own permission check. The three `callEndpoint` variants form a spectrum:

| Variant | Permission | Approval | Debug/DryRun |
|---------|-----------|----------|---------------|
| `callEndpoint(id, payload)` | ✅ full | ✅ | ✅ |
| `callEndpoint(id, payload, { bypassPermission: true })` | ❌ skipped | ❌ skipped | ✅ |
| `callEndpointRaw(endpoint, payload)` | ❌ | ❌ | ❌ |

### Design rationale

The tool is the semantic boundary for permission. It knows:
- What access level the operation truly requires (read, write, or both)
- Whether a field is a notebook ID vs document ID
- How to produce a meaningful error message for the user

Endpoint-level permission is a safety net for direct `siyuan api` calls. When a tool wraps multiple endpoint calls into a higher-level operation, the tool-level check is authoritative and internal calls should bypass.

---

## Approval gate

After both phases pass, `executeEndpoint()` evaluates the approval gate.

Approval sources:

1. **Pure-caller `approval` rule**: `engine.evaluate({ endpoint, tool?, action })` returns `approval`.
2. **Resource-level `approval` rule**: Phase 2 (`applyPayloadGuard`) returns `{{ needsApproval: true }` when any `checkContentRef` call encounters an `approval` effect.

```ts
const ruleEffect = engine.evaluate({ endpoint, tool?, action });
const { needsApproval: phase2NeedsApproval } = await applyPayloadGuard(...);
const wouldRequestApproval =
    ruleEffect === 'approval' ||
    phase2NeedsApproval;
```

There is no classification-derived approval fallback. Derived `severity` is display metadata and warning input, not policy.

### `approval` effect asymmetry: payload vs response

`approval` is a **pre-execution gate**. It applies to payload checks (Phase 1 and Phase 2) and triggers before the kernel call.

For **response filtering** (`guard.response` / `filterItems` on the response), only `deny` is meaningful. Items matched by an `approval` rule in the response are kept (treated as `allow`). By the time the response arrives, the kernel has already executed the operation — there is nothing left to confirm.

---

## Rule ordering patterns

Order is the only priority mechanism. Two canonical patterns:

```yaml
# Pattern A: broad allow + specific deny
# Specific deny MUST come before the broad allow.
rules:
  - notebook: "A"
    path: "/secret/**"
    effect: deny      # ① specific — checked first
  - notebook: "A"
    effect: allow     # ② broad — only reached when ① doesn't match

# Pattern B: broad deny + specific allow
# Specific allow MUST come before the catch-all deny.
rules:
  - tool: "append-content"
    notebook: "A"
    effect: allow     # ① specific allow — checked first
  - action: write
    effect: deny      # ② broad write deny — reached for everything else
```

A pure-caller rule placed before a resource-qualified rule will shadow it for any caller that matches, because `matchesResource` returns true for rules with no resource conditions. If you want resource-qualified rules to take effect, place them before any broad pure-caller rules that cover the same endpoint/tool.

---

## `approval` effect semantics

`approval` routes the call through the approval broker (a separate HTTP process) and opens a browser UI for human confirmation. It does not deny the call — it suspends it pending a decision.

`--yes` bypasses approval when `behavior.allowYes` is true (default). When `allowYes` is false, `--yes` is ignored and approval is always required.

Recommended explicit policy:

```yaml
permission:
  default: allow
  rules:
    - action: write
      effect: approval
      note: "Confirm write operations"
    - action: invoke
      effect: approval
      note: "Confirm invoke operations"
```

---

## Error taxonomy

| Error code | Source | Cause |
|---|---|---|
| `ENDPOINT_DENIED` | `checkEndpoint()` / `checkTool()` | pure-caller deny rule or default deny |
| `CONTENT_DENIED` | `checkContentRef()` | resource-qualified deny rule or default deny |
| `APPROVAL_UNAVAILABLE` | `executeEndpoint()` | approval required but no workspace resolved (needed to spawn broker) |
| `BLOCK_NOT_FOUND` | id resolution in Phase 2 | block id not found in kernel SQL |
| `CONFIG_PARSE_ERROR` | config loading | invalid config shape or unknown permission rule field |
| `PROJECT_CONFIG_PARSE_ERROR` | project config loading | invalid project config shape or unknown permission rule field |

Exit code `5` (`ExitCode.PERMISSION`) for `ENDPOINT_DENIED` and `CONTENT_DENIED`. Config parse errors use `ExitCode.CONFIG`.

---

## Key files

| File | Role |
|------|------|
| `/src/shared/permission.ts` | `PermissionEngine`, `cascadePermission`, Phase 1 + Phase 2 logic |
| `/src/api/guard.ts` | `executeEndpoint`: wires Phase 1 → Phase 2 → approval gate → kernel call; `bypassPermission` option |
| `/src/shared/schema.ts` | `PermissionRule`, `PermissionConfig`, `PermissionContext`, `CallEndpointOptions`, rule validation types |
| `/src/tool/command.ts` | Tool-level `payloadTargets` guard evaluation before `run()` |
| `/src/tool/registry.ts` | `createToolContext`: wires `callEndpoint` with `bypassPermission` support |
| `/src/workspace/config.ts` | global/workspace config loading, permission normalization and validation |
| `/src/workspace/project-config.ts` | `.siyuan-cli.yaml` loading and project permission validation |
| `/src/workspace/resolve.ts` | `effectivePermission` attachment from project config |
| `/src/docs/cli-usage/permission.md` | user-facing permission reference |

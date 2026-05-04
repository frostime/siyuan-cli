---
name: permission-model
description: "Permission engine architecture: rule-list model, two-phase evaluation, rule cascade, project override semantics, and approval effect semantics."
updated: 2026-05-01
scope:
  - /src/shared/permission.ts
  - /src/api/guard.ts
  - /src/shared/schema.ts
  - /src/workspace/config.ts
  - /src/workspace/resolve.ts
  - /src/workspace/project-config.ts
deprecated: false
replacement: ""
---

# Permission Model

## Overview

The permission system is a **unified rule-list model**: a flat ordered list of rules evaluated top-to-bottom, first full match wins. There is no "deny beats allow" override — order is the only priority mechanism.

Rules are assembled from up to three config layers and evaluated by `PermissionEngine` in `src/shared/permission.ts`. The engine is constructed once per invocation in `guard.ts` and reused across Phase 1 and Phase 2.

---

## Rule structure

Each rule has optional conditions and a mandatory effect:

| Field | Match method | Omitted means |
|-------|-------------|---------------|
| `endpoint` | glob (micromatch) on endpoint id | any endpoint |
| `tool` | glob (micromatch) on tool id | any tool (or no tool) |
| `action` | exact: `read` \| `write` | any action |
| `notebook` | exact match on notebook id | any notebook |
| `path` | glob (micromatch) on SiYuan id-based path | any path |
| `root_id` | convenience alias, normalized to `path: "**/<id>.sy"` | any root |
| `effect` | — | **required**: `allow` \| `deny` \| `approval` |
| `note` | — | ignored; human annotation |

A rule with no conditions matches every context — useful as a final catch-all.

**`root_id` is a convenience alias.** When set, it is normalized to `path: "**/<root_id>.sy"` during config loading. If both `root_id` and `path` are set, a `ROOT_ID_OVERRIDES_PATH` warning is emitted and `root_id` takes precedence. `root_id` values missing the `.sy` suffix trigger a `LIKELY_PATH_MISSING_SY_SUFFIX` warning.

**`notebook` and `path` only accept ID-based values**, not hpaths. Reason: hpaths are mutable (renaming a document changes its hpath), while IDs are stable. The engine does not resolve hpaths. A smoke-test warning (`LIKELY_HPATH_NOT_ID`, `LIKELY_HPATH_NOT_ID_IN_PATH`) is emitted on config load when a value looks like an hpath.

---

## Rule cascade

Without a project override, the final rule list and default effect are assembled from the global config:

```
final rules   = project.rules (if any)
              ++ workspace.rules
              ++ defaults.rules

final default = project.default
             ?? workspace.default
             ?? defaults.default
             ?? "allow"
```

Implemented in `cascadePermission()` in `src/shared/permission.ts`.

**Project permission takes precedence by position, not by replacement.** When `.siyuan-cli.yaml` declares a `permission` block, its rules are prepended to the rule list. Because evaluation is first-match-wins, project rules shadow workspace/defaults rules for any context they cover. Workspace/defaults rules remain in the list and still apply to contexts the project rules did not match.

The project `permission` block is **independent of how the workspace name was determined**. If `--workspace prod` overrides the workspace but a `.siyuan-cli.yaml` is found in cwd, the project's permission still applies. Rationale: `--workspace` expresses "use a different target", while the project file expresses "in this directory, these rules apply" — they are orthogonal.

---

## Two-phase evaluation

Permission checks are split into two phases because the available context differs at each point in the execution pipeline.

### Phase 1 — caller gate (`checkEndpoint` / `checkTool`)

Called before payload parsing. Only caller info is available: `endpoint`, `tool`, `action`.

Three outcomes:

1. **A pure-caller deny rule matches** (rule has no `notebook`/`path` conditions) → throw `EndpointDeniedError` immediately.
2. **Only resource-qualified rules match this caller** → defer; Phase 2 will decide once resource info is available. Default is NOT applied here.
3. **No rules match** → apply default. If default is `deny`, throw immediately.

"Pure-caller" means the rule has no `notebook` or `path` conditions. Such rules produce immediate verdicts in Phase 1.

### Phase 2 — resource gate (`checkContentRef` / `filterItems`)

Called from `applyPayloadGuard` in `guard.ts`, once per `payloadTarget` declared in the endpoint schema. Full context is available: `endpoint`, `tool`, `action`, `notebook`, `path`.

- Runs `evaluateVerbose()` against the full rule list (same list as Phase 1 — no separation).
- If effect is `deny` → throw `ContentDeniedError`.
- If effect is `allow` or `approval` → pass through. (Approval is handled separately in the approval gate.)

**Phase 2 only runs if the endpoint declares `payloadTargets`.** If an endpoint has no `payloadTargets`, resource-qualified rules targeting that endpoint's resources are never evaluated. This is a known constraint: the endpoint schema author is responsible for declaring `payloadTargets` for any endpoint where resource-level rules should apply.

### Approval gate (post-Phase-2, in `guard.ts`)

After both phases pass, `executeEndpoint` evaluates the approval gate. Three sources can trigger approval:

1. **Pure-caller `approval` rule**: `engine.evaluate({ endpoint, tool?, action })` returns `approval`.
2. **Resource-level `approval` rule**: Phase 2 (`applyPayloadGuard`) returns `{ needsApproval: true }` when any `checkContentRef` call encounters an `approval` effect.
3. **Risk-auto**: `evaluate()` returns `allow` but the endpoint's derived risk is `destructive` or `critical`.

```ts
const ruleEffect = engine.evaluate({ endpoint, tool?, action });
const { needsApproval: phase2NeedsApproval } = await applyPayloadGuard(...);
const wouldRequestApproval =
    ruleEffect === 'approval' ||
    phase2NeedsApproval ||
    (ruleEffect === 'allow' && isHighRisk(entry.meta.risk));
```

`deny` is never overridden by risk-auto approval.

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

Risk-auto approval: if `evaluate()` returns `allow` but the endpoint's derived risk is `destructive` or `critical`, the guard automatically routes through approval. This post-processing is in `guard.ts`, not in the engine. The engine always returns the raw rule result.

---

## Error taxonomy

| Error code | Source | Cause |
|---|---|---|
| `ENDPOINT_DENIED` | `checkEndpoint()` / `checkTool()` | pure-caller deny rule or default deny |
| `CONTENT_DENIED` | `checkContentRef()` | resource-qualified deny rule or default deny |
| `APPROVAL_UNAVAILABLE` | `executeEndpoint()` | approval required but no workspace resolved (needed to spawn broker) |
| `BLOCK_NOT_FOUND` | id resolution in Phase 2 | block id not found in kernel SQL |

Exit code `5` (`ExitCode.PERMISSION`) for `ENDPOINT_DENIED` and `CONTENT_DENIED`. Exit code `1` for the others.

---

## Key files

| File | Role |
|------|------|
| `src/shared/permission.ts` | `PermissionEngine`, `cascadePermission`, Phase 1 + Phase 2 logic |
| `src/api/guard.ts` | `executeEndpoint`: wires Phase 1 → Phase 2 → approval gate → kernel call |
| `src/shared/schema.ts` | `PermissionRule`, `PermissionConfig`, `PermissionContext` types |
| `src/workspace/config.ts` | `cascadePermission` caller; `resolveEffectiveBehavior` |
| `src/workspace/resolve.ts` | `effectivePermission` attachment (project override) |
| `docs/extending/30-config.md` | User-facing reference (may lag behind this spec-doc) |

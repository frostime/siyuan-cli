---
title: Classification and Risk Derivation
slug: classification-and-risk
summary: How to pick mode/surface/scope/operation and what risk falls out of them.
---

# Classification and Risk Derivation

GATE: fill this in every `EndpointSchema`. Risk is derived from it.

## The four axes

### `mode` — what the endpoint does

- `read` — observes state, no durable change
- `write` — modifies content, workspace files, or configuration
- `invoke` — triggers a runtime action (notification, kernel control); not "read" because it has side effects, not "write" because it doesn't change stored data by itself

### `surface` — what it touches

- `meta` — kernel metadata (version, boot, time)
- `content` — blocks, documents, notebooks, attributes
- `asset` — files referenced as assets (images, pdf)
- `workspace` — filesystem under the workspace root (`/api/file/*`)
- `runtime` — kernel process state (exit, logout, flush)
- `network` — outbound network calls (forwardProxy)

### `scope` — how wide

- `single` — one block / document / notebook / path
- `batch` — explicit set (e.g. array of ids)
- `global` — full-database query or full listing; requires response guard

### `operation` — verb-ish label (optional but recommended)

`inspect | search | query | create | update | delete | move | upload | control`

Used for tags and filtering; not part of risk derivation.

## Risk derivation (automatic)

`src/core/registry.ts::deriveRisk` computes `RiskLabel` from `(mode, surface, scope)`:

```text
read  + meta                     → safe
read  + content  | asset         → sensitive
read  + workspace | network      → elevated
write + content  | asset         → elevated  (single) / destructive (batch, global)
write + workspace                → critical
invoke + runtime                 → destructive
invoke + network                 → critical
else                             → elevated
```

High-risk approval is computed at runtime: `destructive` or `critical` → approval required.

## `riskOverride` — when to bypass

Use when the derivation is clearly wrong for this specific endpoint. Always leave a comment.

```ts
classification: {
  mode: "invoke",
  surface: "runtime",
  scope: "single",
  operation: "control",
  // UI-only notification; affects runtime UX but does not alter data or durable state.
  riskOverride: "safe",
},
```

Real examples from `src/apis/`:

| Endpoint | Default risk | Override | Reason |
|---|---|---|---|
| `notification.pushMsg` | destructive (invoke+runtime) | `safe` | UI toast only |
| `notification.pushErrMsg` | destructive | `safe` | UI toast only |
| `system.exit` | destructive | `critical` | kills kernel process |
| `system.logoutAuth` | destructive | `sensitive` | session only, no data loss |
| `system.getConf` | safe (read+meta) | `sensitive` | full system config is sensitive |

**Do not** use `riskOverride` to silence an approval gate you find annoying. The approval gate is the feature.

## Approval policy (user-controlled extension)

Approval is required when **either** is true:

1. **Risk-auto**: endpoint risk is `destructive` or `critical`
2. **Rule effect**: the permission engine's `evaluate()` returns `'approval'` for this call

This post-processing happens in `guard.ts::executeEndpoint` — the engine itself just returns the effect. User rules that return `deny` are never overridden. Risk-auto only sends `allow` through approval.

To require approval on all writes (for example):

```yaml
permission:
  rules:
    - action: write
      effect: approval
```

The schema author cannot disable risk-auto approval — only the user can extend it via rules.

## Picking the right classification

**Example decisions**:

`/api/query/sql`
- `mode: read` — select only (policy-enforced; not by kernel)
- `surface: content` — queries the block database
- `scope: global` — no path-scoped pre-filter
- `operation: query`
- → must declare `guard.response` (registry enforces)

`/api/block/updateBlock`
- `mode: write` + `surface: content` + `scope: single` + `operation: update`
- risk = elevated, no auto-approval

`/api/filetree/moveDocs`
- `write + content + batch + move`
- risk = destructive, auto-approval

`/api/network/forwardProxy`
- `invoke + network + single + control`
- risk = critical, auto-approval

`/api/file/putFile`
- `write + workspace + single + update`
- risk = critical, auto-approval

`/api/system/exit`
- `invoke + runtime + single + control` with `riskOverride: "critical"`

## Validation at startup

`validateSchema()` only enforces the global-read-requires-guard rule. Other classification combinations are never rejected — use review to catch mismatches.

## One-line summary

**Classification is authored once; risk is computed. Don't author computed fields.**

---
title: Permission and Guard
slug: permission
summary: Permission rule syntax, evaluation order, risk-based auto-approval, two-phase checking, extension schema coupling, and debugging.
---

# Permission and Guard

> For workspace setup, token sources, behavior config, and project anchoring, see [`workspace-config.md`](workspace-config.md).

## Overview

The CLI enforces two layers of permission:

1. **Config rules** (this doc) — user-authored YAML rules in `config.yaml` or `.siyuan-cli.yaml` that allow/deny/approve operations by endpoint, tool, notebook, path, and action.
2. **Schema-level guard** (§ Extension schema coupling) — built into every endpoint schema via `classification` (risk) and `guard.payloadTargets` (resource resolution). Extension authors define what the user's rules can control.

Config rules are optional. Without them, the default is `allow`, and only built-in risk-based auto-approval (for destructive/critical operations) may trigger.

## Rule structure

```yaml
permission:
  default: allow         # fallback when no rule matches; defaults to "allow"

  rules:
    - endpoint: "query.sql"
      action: read
      effect: allow

    - tool: "append-content"
      notebook: "20260101215354-j0c5gvk"
      effect: allow

    - notebook: "20260101215354-bbb"
      path: "/20260107143325-zbrtqup/**"
      effect: deny

    - action: write
      effect: approval   # all writes open the Approval Center
```

## Rule fields

| Field | Type | Match method | Omitted means |
|-------|------|-------------|---------------|
| `endpoint` | string | glob (micromatch) | any endpoint |
| `tool` | string | glob (micromatch) | any tool (or direct API call) |
| `action` | `"read"` \| `"write"` | exact | any action |
| `notebook` | string | exact match (must be kernel id format) | any notebook |
| `path` | string | glob (micromatch) | any path |
| `effect` | `"allow"` \| `"deny"` \| `"approval"` | — | **required** |
| `note` | string | — | human annotation, ignored by engine |

## Evaluation: top-to-bottom, first match wins

```text
for each rule:
  if every declared field matches the current context:
    return rule.effect
return default
```

Absent fields are wildcards. A rule with only `effect` matches everything — useful as a catch-all.

**Order is the only priority mechanism.** There is no "deny beats allow" override.

```yaml
# Pattern A: broad allow + specific deny
# The deny MUST come before the allow, or it is unreachable.
rules:
  - notebook: "A"
    path: "/secret/**"
    effect: deny         # ① checked first
  - notebook: "A"
    effect: allow        # ② reached only when ① doesn't match

# Pattern B: specific allow + broad deny
rules:
  - tool: "append-content"
    notebook: "A"
    effect: allow        # ① specific exception
  - action: write
    effect: deny         # ② broad catch-all
```

## Glob patterns

| Pattern | Matches |
|---------|---------|
| `query.*` | `query.sql` |
| `block.get*` | `block.getBlockKramdown`, `block.getBlockInfo` |
| `/journal/**` | `/journal/x.sy`, `/journal/a/b.sy` |
| `/journal/*` | `/journal/x.sy` (one level only) |

## Risk-based auto-approval

Every endpoint has a `classification` that derives a `risk` label. Endpoints classified as `destructive` or `critical` (e.g. batch delete, file write, system exit) **automatically require human approval** via the Approval Center, **even if permission rules return `allow`**.

Passing `--yes` bypasses this gate, but doing so defeats the safety intent. Set `behavior.allowYes: false` to enforce the approval flow and disable the `--yes` bypass (see `workspace-config.md`).

Risk is derived from `classification`:

| classification | derived risk |
|---|---|
| `read + meta` | `safe` |
| `read + content/asset` | `sensitive` |
| `read + workspace/network` | `elevated` |
| `write + content/asset + single` | `elevated` |
| `write + content/asset + batch` | `destructive` |
| `write + workspace` | `critical` |
| `invoke + runtime` | `destructive` |
| `invoke + network` | `critical` |

Run `siyuan api list` to see each endpoint's risk label.

## Extension schema coupling

Permission behavior is not solely controlled by `config.yaml`. Each endpoint (built-in or extension) declares schema fields that determine **what the permission engine can enforce**:

### `classification` → auto-approval

Every endpoint schema declares a `classification`. This is the **source of truth** for risk-based auto-approval. The classification fields (`mode`, `surface`, `scope`) feed the risk derivation matrix above. Extension authors cannot disable auto-approval for destructive operations — only the user can, via `--yes` (if `behavior.allowYes` is true).

Example from an API extension:

```ts
classification: {
  mode: "write",
  surface: "content",
  scope: "batch",       // batch → risk = destructive → auto-approval
  operation: "delete"
}
```

### `guard.payloadTargets` → resource scoping

User rules that use `notebook` or `path` conditions can only match endpoints whose schema declares `guard.payloadTargets`. These tell the CLI which payload fields contain protected resources:

```ts
guard: {
  payloadTargets: [
    { path: "id", kind: "id", access: "read" },
    { path: "ids[*]", kind: "id", access: "write" }
  ]
}
```

- `kind: "id"` → the CLI resolves the block id to its owning document's `notebook` + `path`, enabling notebook/path-scoped rules.
- `kind: "notebook"` → the value is used directly as a notebook id.
- `kind: "path"` → the value is used directly as an id-based document path.

**Without `guard.payloadTargets`**, a user rule like `notebook: "xxx"` cannot match the endpoint — the permission engine has nothing to resolve.

### `guard.response` → response filtering

Global read endpoints (`mode: "read"`, `scope: "global"`) MUST declare a response guard so the CLI can filter out items from disallowed notebooks/paths:

```ts
guard: {
  response: {
    itemsAt: "[*]",
    fieldMap: { id: "id", path: "path", notebook: "box" }
  }
}
```

**`approval` does not apply to response filtering.** The response guard only acts on `deny` — items matched by an `approval` rule are kept, not held for confirmation. This is intentional: by the time the response arrives, the kernel has already executed the operation. Approval is a pre-execution gate; it has no meaningful role after the fact.

### For extension authors

When writing a custom endpoint or tool, consider:
1. What `classification` fits the operation? Remember that `write + batch` triggers auto-approval.
2. Does the payload contain block ids, notebook ids, or paths? If so, declare `guard.payloadTargets` so user rules can scope to them.
3. Is it a global read? If so, you MUST declare `guard.response` or `guard.filterResponse`.

See `extension.md` for the full authoring guide.

## Permission cascade

Without a project override, global permission resolution is:

```text
final rules   = workspace.rules ++ defaults.rules
final default = workspace.default ?? defaults.default ?? "allow"
```

When a project `.siyuan-cli.yaml` declares `permission`, that block becomes the effective permission for the invocation and replaces workspace/defaults permission resolution.

## Two-phase evaluation

Permission checks happen in two stages:

1. **Phase 1** (caller check): only `endpoint`, `tool`, `action` are known. Pure-caller rules produce immediate verdicts. If resource-qualified rules exist, the check is deferred.
2. **Phase 2** (content check): full context `{endpoint, tool, action, notebook, path}` is available after resolving block ids. First full-match rule wins.

This means a rule with both `tool: "X"` and `notebook: "Y"` only fires in Phase 2, after the target notebook is resolved from the payload.

### Effect asymmetry: `approval` applies to payload only

All three effects (`allow`, `deny`, `approval`) work in both phases for **payload checks** — a resource-qualified `approval` rule correctly triggers the Approval Center before the kernel call.

For **response filtering**, only `deny` is meaningful. Items matched by an `approval` rule in the response are kept (treated as `allow`). Approval is a pre-execution gate; once the kernel has responded, the operation is complete and there is nothing left to confirm.

## Full config example

```yaml
defaults:
  permission:
    default: allow
    rules:
      # Essential read access for all workspaces
      - endpoint: "query.sql"
        action: read
        effect: allow
      - endpoint: "block.get*"
        action: read
        effect: allow
      # Hard deny dangerous system operations
      - endpoint: "system.exit"
        effect: deny

workspaces:
  main:
    baseUrl: http://127.0.0.1:6806
    tokenSource: { type: env, value: SIYUAN_TOKEN }
    permission:
      rules:
        # notebook A: read OK, writes only via append-content tool
        - tool: "append-content"
          notebook: "20260101215354-aaa"
          effect: allow
        - notebook: "20260101215354-aaa"
          action: read
          effect: allow
        - notebook: "20260101215354-aaa"
          action: write
          effect: deny
        # notebook B: deny a subtree, allow the rest
        - notebook: "20260101215354-bbb"
          path: "/20260107143325-zbrtqup/**"
          effect: deny
        - notebook: "20260101215354-bbb"
          effect: allow
```

Final rule chain for workspace `main`: workspace rules (5) ++ defaults rules (3) = 8 rules, evaluated top-to-bottom.

## Debugging permissions

1. `siyuan workspace which` — see the complete rule list and resolution source
2. `siyuan api <id> --debug` — see endpoint id and assembled payload
3. Read the error message: `ENDPOINT_DENIED` includes the rule index or "default deny" when an explicit deny-default policy is active; `CONTENT_DENIED` includes the resource kind/value and matching rule index
4. Common fixes:
   - `ENDPOINT_DENIED` → add an `allow` rule for this endpoint, or check that an existing rule's glob pattern matches
   - `CONTENT_DENIED` → add an `allow` rule scoped to the target notebook/path
   - `APPROVAL_UNAVAILABLE` → the Approval Center was unavailable; inspect broker state with `siyuan approval status`, or relax the rule to `allow`

## Config smoke warnings

On load, the CLI warns (stderr, non-fatal) about likely mistakes:

- `LIKELY_HPATH_NOT_ID`: a `notebook` rule value doesn't match the kernel id pattern `^\d{14}-[0-9a-z]{7}$` — you may have used an hpath instead of an id
- `LIKELY_HPATH_NOT_ID_IN_PATH`: a `path` rule value contains no id segment — same issue

## Related docs

- [`workspace-config.md`](workspace-config.md) — config file setup, workspaces, tokens, behavior, project anchoring
- [`cli-overview.md`](cli-overview.md) — Approval Center commands and broker lifecycle
- [`extension.md`](extension.md) — writing custom API endpoints and tools with `classification` and `guard`

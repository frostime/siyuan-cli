---
title: Permission and Guard
slug: permission
summary: Permission rule syntax, evaluation order, risk-based auto-approval, two-phase checking, and debugging.
---

# Permission and Guard

> For workspace setup, token sources, behavior config, and project anchoring, see [`workspace-config.md`](workspace-config.md).
> For extension schema coupling (classification, guard.payloadTargets, guard.response) → [`extension.md`](extension.md) §Permission schema coupling.

## Overview

The CLI enforces two layers of permission:

1. **Config rules** (this doc) — user-authored YAML rules in `config.yaml` or `.siyuan-cli.yaml` that allow/deny/approve operations by endpoint, tool, notebook, path, and action.
2. **Schema-level guard** — built into every endpoint schema via `classification` (risk) and `guard.payloadTargets` (resource resolution). Extension authors define what the user's rules can control. See `extension.md` for schema authoring.

Config rules are optional. Without them, the default is `allow`, and only built-in risk-based auto-approval (for destructive/critical operations) may trigger.

## Rule structure

```yaml
permission:
  default: allow         # fallback when no rule matches; defaults to "allow"

  rules:
    - endpoint: "query.sql"
      action: read
      effect: allow

    - endpoint: "block.append*"
      notebook: "20260101215354-j0c5gvk"
      effect: allow

    - notebook: "20260101215354-bbb"
      path: "**/20260107143325-zbrtqup.sy"
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
| `path` | string | glob (micromatch) on raw `blocks.path` values (includes `.sy` for documents) | any path |
| `root_id` | string | exact match document block id; normalized internally to `path: "**/<id>.sy"` | any document |
| `effect` | `"allow"` \| `"deny"` \| `"approval"` | — | **required** |
| `note` | string | — | human annotation, ignored by engine |

### `path` semantics

`path` is matched against the kernel's raw `blocks.path` column value. A document path ends with `.sy` (for example `/20230725154155-hq3iw5w.sy`).

- Match one document by id: `path: "**/<docId>.sy"`
- `path: "**/<docId>"` does not match that document
- `path: "/<docId>/**"` matches descendants under that document id directory, not the document file itself
- Without glob wildcards (`*`, `**`, `?`, `[]`, `{}`), matching is exact string only

### `root_id` semantics

`root_id` is a convenience alias for `path: "**/<docId>.sy"`. It matches any block whose owning document has the given `root_id`, regardless of where the document sits in the notebook tree.

If both `root_id` and `path` are set on the same rule, `root_id` takes precedence and `path` is ignored (a `ROOT_ID_OVERRIDES_PATH` warning is emitted).

```yaml
# These two rules are equivalent:
- root_id: "20230725154155-hq3iw5w"
  effect: deny

- path: "**/20230725154155-hq3iw5w.sy"
  effect: deny
```

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
  - endpoint: "block.append*"
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
| `**/20260107143325-zbrtqup.sy` | `/20260107143325-zbrtqup.sy`, `/parent/20260107143325-zbrtqup.sy` |
| `/20260107143325-zbrtqup/**` | `/20260107143325-zbrtqup/child.sy`, `/20260107143325-zbrtqup/a/b.sy` |

## Risk-based auto-approval

Every endpoint has a `classification` that derives a `risk` label. Endpoints classified as `destructive` or `critical` **automatically require human approval** via the Approval Center, **even if permission rules return `allow`**.

Passing `--yes` bypasses this gate. Set `behavior.allowYes: false` to enforce the approval flow (see `workspace-config.md`).

Risk derivation matrix:

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

## Raw API boundary

`siyuan api raw <endpoint>` bypasses endpoint schemas entirely:

- no payload schema validation
- no `guard.payloadTargets` → notebook/path-scoped rules cannot be enforced
- no response filtering
- no compact formatter

Raw calls are controlled by `behavior.rawApi` config (see `workspace-config.md`). Use only as a one-off escape hatch. For repeated use, write an API extension instead.

## Permission cascade

Without a project override:

```text
final rules   = workspace.rules ++ defaults.rules
final default = workspace.default ?? defaults.default ?? "allow"
```

When a project `.siyuan-cli.yaml` declares `permission`, it replaces workspace/defaults permission resolution entirely.

## Two-phase evaluation

Permission checks happen in two stages:

1. **Phase 1** (caller check): only `endpoint`, `tool`, `action` are known. Pure-caller rules produce immediate verdicts. If resource-qualified rules exist, the check is deferred.
2. **Phase 2** (content check): full context `{endpoint, tool, action, notebook, path}` is available after resolving block ids. First full-match rule wins.

A rule with both `tool: "X"` and `notebook: "Y"` only fires in Phase 2, after the target notebook is resolved from the payload.

### Effect asymmetry: `approval` applies to payload only

All three effects work in both phases for **payload checks**. For **response filtering**, only `deny` is meaningful — items matched by `approval` are kept (treated as `allow`). Approval is a pre-execution gate; once the kernel has responded, there is nothing left to confirm.

## Full config example

```yaml
defaults:
  permission:
    default: allow
    rules:
      - endpoint: "query.sql"
        action: read
        effect: allow
      - endpoint: "block.get*"
        action: read
        effect: allow
      - endpoint: "system.exit"
        effect: deny

workspaces:
  main:
    baseUrl: http://127.0.0.1:6806
    tokenSource: { type: env, value: SIYUAN_TOKEN }
    permission:
      rules:
        - endpoint: "block.append*"
          notebook: "20260101215354-aaa"
          effect: allow
        - notebook: "20260101215354-aaa"
          action: read
          effect: allow
        - notebook: "20260101215354-aaa"
          action: write
          effect: deny
        - notebook: "20260101215354-bbb"
          path: "/20260107143325-zbrtqup/**"
          effect: deny
        - notebook: "20260101215354-bbb"
          effect: allow
        - root_id: "20260107143334-l5eqs5i"
          effect: deny
```

Final rule chain for workspace `main`: workspace rules (5) ++ defaults rules (3) = 8 rules, evaluated top-to-bottom.

## Debugging permissions

1. `siyuan workspace which` — see the complete rule list and resolution source
2. `siyuan api <id> --debug` — see endpoint id and assembled payload
3. Read the error message: `ENDPOINT_DENIED` includes the rule index or "default deny" when the fallback `permission.default` is `deny`; `CONTENT_DENIED` includes resource kind/value and matching rule index
4. Common fixes:
   - `ENDPOINT_DENIED` → add an `allow` rule for this endpoint, or check glob pattern
   - `CONTENT_DENIED` → add an `allow` rule scoped to the target notebook/path
   - `APPROVAL_UNAVAILABLE` → inspect broker state with `siyuan approval status`

## Config smoke warnings

On load, the CLI warns (stderr, non-fatal) about likely mistakes:

- `LIKELY_HPATH_NOT_ID`: `notebook`/`root_id` value doesn't match `^\d{14}-[0-9a-z]{7}$`
- `LIKELY_HPATH_NOT_ID_IN_PATH`: `path` value contains no id segment
- `LIKELY_PATH_MISSING_SY_SUFFIX`: `path` ends on id without `.sy`
- `ROOT_ID_OVERRIDES_PATH`: both `root_id` and `path` set; `path` ignored

## Related docs

- [`workspace-config.md`](workspace-config.md) — config file setup, workspaces, tokens, behavior
- [`cli-overview.md`](cli-overview.md) — Approval Center commands and broker lifecycle
- [`extension.md`](extension.md) — extension authoring with `classification` and `guard` schema coupling

---
title: Config and Permission Model
slug: config-and-permission
summary: config.yaml structure, workspace entries, token sources, and the unified rule-list permission model that guards enforce.
---

# Config and Permission Model

GATE: read this before writing a new guard or debugging a `CONTENT_DENIED` or `ENDPOINT_DENIED` error.

## File location

Resolution order in `src/utils/paths.ts`:

1. `SIYUAN_CLI_CONFIG` env var (file path or dir)
2. `XDG_CONFIG_HOME/siyuan-cli/config.yaml`
3. `~/.config/siyuan-cli/config.yaml` (all platforms)

Legacy Windows path `%APPDATA%/siyuan-cli/config.yaml` is migrated to `~/.config/siyuan-cli/config.yaml` on next load, emitting a `CONFIG_MIGRATED` notice. File mode is set to `0600` on POSIX (Windows ignores).

## Full structure

```yaml
schemaVersion: 2
current: home                          # active workspace name

workspaces:
  home:
    baseUrl: http://127.0.0.1:6806
    token: <literal-token>             # pick ONE token source
    # tokenSource:                     # or env / file / command
    #   type: env
    #   value: SIYUAN_TOKEN
    permission:
      # ... overrides for this workspace
  work:
    baseUrl: http://192.168.1.10:6806
    tokenSource:
      type: command
      value: "security find-generic-password -a siyuan -w"

defaults:
  permission:
    # ... applied to any workspace without its own permission block
```

Unknown `schemaVersion` throws `CONFIG_VERSION_UNSUPPORTED` — no silent upgrade during alpha.

## Token sources (pick one per workspace)

| Field | Value |
|---|---|
| `token` | literal string (simplest, stored in config) |
| `tokenSource: { type: env, value: VARNAME }` | `process.env.VARNAME` |
| `tokenSource: { type: file, value: /path/to/file }` | first line of file, trimmed |
| `tokenSource: { type: command, value: "cmd args" }` | stdout of the command, trimmed |

Runtime overrides (highest priority wins):

1. `--token <value>` CLI flag
2. `SIYUAN_CLI_TOKEN` env var
3. resolved `tokenSource`
4. literal `token`

Workspace override: `--workspace <name>` or `SIYUAN_CLI_WORKSPACE` env var.

## `PermissionConfig` shape

```yaml
permission:
  default: allow         # fallback when no rule matches; default is 'allow'

  rules:
    - endpoint: "query.sql"      # glob on endpoint id (micromatch)
      action: read               # read | write  (omit = any action)
      effect: allow              # allow | deny | confirm

    - tool: "append-content"     # glob on tool id
      notebook: "20260101-life"  # exact notebook id
      effect: allow              # this tool may write to this notebook

    - notebook: "20260101-work"
      path: "/20260107143325-zbrtqup/**"   # glob on SiYuan id-based path
      effect: deny

    - action: write
      effect: confirm            # all writes require --yes
```

### Rule fields

| Field | Type | Match method | Omitted means |
|-------|------|-------------|---------------|
| `endpoint` | string | glob (micromatch) | any endpoint |
| `tool` | string | glob (micromatch) | any tool (or no tool) |
| `action` | `"read"` \| `"write"` | exact | any action |
| `notebook` | string | exact match | any notebook |
| `path` | string | glob (micromatch) | any path |
| `effect` | `"allow"` \| `"deny"` \| `"confirm"` | — | (required) |
| `note` | string | — | ignored; human annotation |

### Evaluation

Rules are evaluated top-to-bottom. First matching rule wins.

```
evaluate(context, rules, default):
  for rule in rules:
    if every declared condition in rule matches context:
      return rule.effect
  return default
```

A condition is "declared" if the field is present in the rule. Absent fields match anything (wildcard). A rule with no conditions matches every context — useful as a final catch-all.

**Order is the only priority mechanism.** There is no "deny beats allow" override. Two patterns:

```yaml
# Pattern A: broad allow + specific deny
# Specific deny MUST come before the broad allow, or it will never be reached.
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

If you reverse the order in either pattern, the broad rule matches first and the specific rule is unreachable.

### Two-phase evaluation

Permission checks happen in two phases because the available context differs:

**Phase 1** (`checkEndpoint` / `checkTool`): only caller info (`endpoint`, `tool`, `action`) is known, no resource.

- Pure caller rules (no `notebook` / `path` conditions) produce immediate verdicts.
- If resource-qualified rules exist whose caller conditions match → defer; Phase 2 decides once the resource is known.
- If no rules match and `default: deny` → deny immediately; with the default fallback `allow`, unmatched calls pass through.

**Phase 2** (`checkContentRef` / `filterItems`): full context `{endpoint, tool, action, notebook, path}`.

- First full-match rule wins.
- No match → `default` effect.

### Risk-auto confirm (post-processing in guard.ts)

If the rule evaluation returns `allow` but the endpoint's derived risk is `destructive` or `critical` (`meta.requiresConfirmation = true`), the effect is upgraded to `confirm`. User rules that return `deny` are never overridden (deny is always honored).

This post-processing lives in `guard.ts::executeEndpoint`, not inside the engine. The engine's `evaluate()` always returns the raw rule result.

## Permission cascade

Final rules and default are assembled by concatenating layers:

```
final rules   = project.rules ++ workspace.rules ++ defaults.rules
final default = project.default ?? workspace.default ?? defaults.default ?? "allow"
```

Project rules come first → highest priority. No replace-vs-merge ambiguity: list order is priority.

If a project `.siyuan-cli.yaml` declares `permission`, its rules are prepended. See `31-workspace-resolution.md`.

## Permission error taxonomy

| Error | Source | Cause |
|---|---|---|
| `ENDPOINT_DENIED` | `checkEndpoint()` / `checkTool()` | caller denied by a pure-caller rule or default |
| `CONTENT_DENIED` | `checkContentRef()` | content access denied by a resource-matching rule or default |
| `CONFIRMATION_REQUIRED` | `executeEndpoint()` | needs `--yes` (rule effect = `confirm`, or risk-auto) |
| `BLOCK_NOT_FOUND` | id resolution | id doesn't exist in the kernel |

Exit code `5` (`ExitCode.PERMISSION`) applies to hard policy denials: `ENDPOINT_DENIED` and `CONTENT_DENIED`.
`BLOCK_NOT_FOUND` and `CONFIRMATION_REQUIRED` are general failures (exit code `1`).

## Full config example

```yaml
defaults:
  permission:
    default: allow
    rules:
      # Allow essential read endpoints for all workspaces
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
        # notebook A: readable, writes allowed only via append-content tool
        - tool: "append-content"
          notebook: "20260101-aaa"
          effect: allow

        - notebook: "20260101-aaa"
          action: read
          effect: allow

        - notebook: "20260101-aaa"
          action: write
          effect: deny

        # notebook B: deny a specific subtree, allow the rest
        - notebook: "20260101-bbb"
          path: "/20260107143325-zbrtqup/**"
          effect: deny

        - notebook: "20260101-bbb"
          effect: allow
```

Final rule chain for workspace `main`: `workspace.rules ++ defaults.rules` (9 rules total, evaluated top-to-bottom).

## Smoke warnings

On config load, `warnRulesSmoke` scans each rule for likely mistakes:

- `notebook` value that doesn't match `^\d{14}-[0-9a-z]{7}$` → `LIKELY_HPATH_NOT_ID`
- `path` value with no id-segment anywhere → `LIKELY_HPATH_NOT_ID_IN_PATH`

Both are stderr warnings, not errors. The CLI continues.

## Glob cheat sheet

| Pattern | Matches |
|---|---|
| `/journal/**` | `/journal/x.sy`, `/journal/a/b.sy` |
| `/journal/*` | `/journal/x.sy` (one level only) |
| `query.*` | `query.sql` (not `queryx.sql`) |
| `block.get*` | `block.getBlockKramdown`, `block.getBlockInfo` |
| `!query.*` | **not** supported — use `effect: deny` |

## Debugging a permission denial

1. `siyuan workspace which` — shows the active rule list for the current directory
2. `siyuan api <id> --debug` — shows endpoint id and payload before execution
3. Read the error: `ENDPOINT_DENIED` gives the rule index or "default deny" when an explicit deny-default policy is active; `CONTENT_DENIED` gives the resource kind/value and rule index
4. Check glob patterns with `micromatch`: `**` crosses `/`, `*` does not

## Project config file (`.siyuan-cli.yaml`)

A project-level file can anchor workspace selection and prepend permission rules per directory tree. See `31-workspace-resolution.md` for the full resolution chain, file format, and validation rules.

Short form:

```yaml
# .siyuan-cli.yaml (project root)
schemaVersion: 1
workspace: prod
permission:
  default: allow
  rules:
    - endpoint: "block.delete*"
      effect: deny
    - notebook: "20260101-aaa"
      path: "/20260107143325-zbrtqup/**"
      effect: deny
```

Fields `token`, `baseUrl`, `tokenSource`, `defaults` are hard-rejected at load time. The file is safe to commit.

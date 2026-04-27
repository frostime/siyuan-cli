---
title: Config and Permission
slug: config-and-permission
summary: Config file structure, workspace entries, token sources, permission rules, and project-level config.
---

# Config and Permission

## Config file location

Resolution order:

1. `$SIYUAN_CLI_CONFIG` env var (file path or directory)
2. `$XDG_CONFIG_HOME/siyuan-cli/config.yaml`
3. `~/.config/siyuan-cli/config.yaml` (all platforms, including Windows)

Created automatically by `siyuan workspace add`. File mode `0600` on POSIX.

## Workspace connection strategies

Two ways to specify where the kernel lives:

| Method | Field | Works for |
|--------|-------|-----------|
| Direct URL | `baseUrl` | Local or remote |
| Directory auto-discovery | `workspaceDir` | Local only — reads `conf.json` to find the runtime port |

At least one must be present per workspace. When both are given, `baseUrl` wins.

Add with `--workspace-dir`:

```bash
siyuan workspace add devspace --workspace-dir /path/to/SiYuanDevSpace --token <token>
```

## Config structure

```yaml
schemaVersion: 1
current: home                          # active workspace name

workspaces:
  home:
    baseUrl: http://127.0.0.1:6806
    token: <literal-token>             # pick ONE token source per workspace
    # workspaceDir: /abs/path/to/siyuan # or: auto-discover port (local only)
    # tokenSource:                     # alternative: external source
    #   type: env
    #   value: SIYUAN_TOKEN
    permission:                        # optional: workspace-level overrides
      default: allow
      rules: [...]
    behavior:                          # optional: workspace-level behavior
      allowYes: false
      approval:
        timeout: 30

  devspace:
    workspaceDir: /path/to/SiYuanDevSpace  # auto-discover port (local only)
    token: <token>
    baseUrl: http://192.168.1.10:6806
    tokenSource:
      type: command
      value: "security find-generic-password -a siyuan -w"

defaults:
  permission:                          # applied to workspaces without their own block
    default: allow
    rules: [...]
  behavior:                            # default behavior for all workspaces
    allowYes: true
    approval:
      timeout: 60
      autoOpen: true
```

## Token sources

Pick **one** per workspace. Runtime overrides (highest priority first):

1. `--token <value>` CLI flag
2. `$SIYUAN_CLI_TOKEN` env var
3. Resolved `tokenSource` (see table)
4. Literal `token` field

| Method | Config |
|--------|--------|
| Literal | `token: "<value>"` |
| Env var | `tokenSource: { type: env, value: SIYUAN_TOKEN }` |
| File | `tokenSource: { type: file, value: /path/to/tokenfile }` |
| Command | `tokenSource: { type: command, value: "cmd args" }` |

## Permission rules

### Structure

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
      effect: approval   # all writes open the Approval Center; --yes bypasses it but is not recommended
```

### Rule fields

| Field | Type | Match method | Omitted means |
|-------|------|-------------|---------------|
| `endpoint` | string | glob (micromatch) | any endpoint |
| `tool` | string | glob (micromatch) | any tool (or direct API call) |
| `action` | `"read"` \| `"write"` | exact | any action |
| `notebook` | string | exact match (must be kernel id format) | any notebook |
| `path` | string | glob (micromatch) | any path |
| `effect` | `"allow"` \| `"deny"` \| `"approval"` | — | **required** |
| `note` | string | — | human annotation, ignored by engine |

### Evaluation: top-to-bottom, first match wins

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

### Glob patterns

| Pattern | Matches |
|---------|---------|
| `query.*` | `query.sql` |
| `block.get*` | `block.getBlockKramdown`, `block.getBlockInfo` |
| `/journal/**` | `/journal/x.sy`, `/journal/a/b.sy` |
| `/journal/*` | `/journal/x.sy` (one level only) |

### Risk-based approval

Endpoints classified as `destructive` or `critical` (e.g. batch delete, file write, system exit) automatically require human approval via the Approval Center, **even if permission rules return `allow`**. Passing `--yes` bypasses this gate, but doing so defeats the safety intent and is not recommended. Set `behavior.allowYes: false` to enforce the approval flow and disable the `--yes` bypass.

### Permission cascade

Without a project override, global permission resolution is:

```text
final rules   = workspace.rules ++ defaults.rules
final default = workspace.default ?? defaults.default ?? "allow"
```

When a project `.siyuan-cli.yaml` declares `permission`, that block becomes the effective permission for the invocation and replaces workspace/defaults permission resolution.

### Two-phase evaluation

Permission checks happen in two stages:

1. **Phase 1** (caller check): only `endpoint`, `tool`, `action` are known. Pure-caller rules produce immediate verdicts. If resource-qualified rules exist, the check is deferred.
2. **Phase 2** (content check): full context `{endpoint, tool, action, notebook, path}` is available after resolving block ids. First full-match rule wins.

This means a rule with both `tool: "X"` and `notebook: "Y"` only fires in Phase 2, after the target notebook is resolved from the payload.

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

## Behavior

Optional `behavior` section controls how the CLI handles approval-gated writes.

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `allowYes` | boolean | `true` | When `false`, `--yes` flag is ignored; approval flow is mandatory |
| `approval.timeout` | number (seconds) | `60` | How long the CLI waits for an approval decision |
| `approval.autoOpen` | boolean | `true` | Whether to auto-open the Approval Center in the browser |

All fields are optional. Omitted fields inherit from the next level in the cascade.

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

### CI / agent usage

For CI pipelines or agent sandboxes where no browser is available:

```yaml
workspaces:
  ci-agent:
    behavior:
      allowYes: true         # CI agent trusts --yes
      approval:
        autoOpen: false      # no browser in CI
```

## Project config (`.siyuan-cli.yaml`)

Drop at project root to pin workspace, add permission rules, and override behavior per directory tree.

```yaml
schemaVersion: 1
workspace: prod              # optional; must exist in global config
permission:                  # optional; replaces workspace/defaults permission for this invocation
  default: allow
  rules:
    - endpoint: "block.delete*"
      effect: deny
    - notebook: "20260101215354-aaa"
      path: "/20260107143325-zbrtqup/**"
      effect: deny
behavior:                    # optional; merged with workspace/defaults behavior
  allowYes: false            # enforce approval flow for this project
  approval:
    timeout: 30
```

### Key properties

- **Safe to commit**: `token`, `baseUrl`, `tokenSource`, `defaults` are hard-rejected at load time. The file cannot hold credentials by design.
- **Discovery**: the CLI walks upward from cwd looking for `.siyuan-cli.yaml`, stopping at `$HOME` or filesystem root. First hit wins; files are not merged.
- **Independent of workspace selection**: `--workspace prod` overrides the workspace name, but the project file's `permission` block still applies.

### Resolution chain

```text
--workspace flag > $SIYUAN_CLI_WORKSPACE > .siyuan-cli.yaml > config.current
```

### Inspect

```bash
siyuan workspace which
```

Output includes `source`, active workspace, project config path (if found), and the full resolved rule list.

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

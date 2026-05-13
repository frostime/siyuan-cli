---
title: Workspace Configuration
slug: workspace-config
summary: Config file location, workspace connections, token sources, CLI behavior, and project-level anchoring.
---

# Workspace Configuration

> For permission rules and risk-based approval, see [`permission.md`](permission.md).

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
    behavior:                          # optional: workspace-level behavior
      allowYes: false
      approval:
        timeout: 30
        openDebounceMs: 1000
    # permission:                      # optional: workspace-level rules (see permission.md)
    #   default: allow
    #   rules: [...]

  devspace:
    workspaceDir: /path/to/SiYuanDevSpace  # auto-discover port (local only)
    token: <token>
    tokenSource:
      type: command
      value: "security find-generic-password -a siyuan -w"

defaults:
  behavior:                            # default behavior for all workspaces
    allowYes: true
    approval:
      timeout: 60
      autoOpen: true
      openDebounceMs: 1000
  # permission:                        # optional: global defaults (see permission.md)
  #   default: allow
  #   rules: [...]
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

## Behavior

Optional `behavior` section controls how the CLI handles approval-gated writes. You don't need to configure this — sensible defaults apply.

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `allowYes` | boolean | `true` | When `false`, `--yes` flag is ignored; approval flow is mandatory |
| `approval.timeout` | number (seconds) | `60` | How long the CLI waits for an approval decision |
| `approval.autoOpen` | boolean | `true` | Whether to auto-open the Approval Center in the browser |
| `approval.openDebounceMs` | number (ms) | `1000` | Suppress repeated browser opens for rapid consecutive approval requests; `0` disables debounce |
| `rawApi.enabled` | boolean | `false` | Enables the raw kernel API fallback command |
| `rawApi.allow` | string[] | `[]` | Endpoint-id glob patterns allowed through `siyuan api raw` |

All fields are optional. Omitted fields inherit from the next level in the cascade.

### Merge precedence

Project > Workspace > Defaults > Built-in.

Merge is field-level for `allowYes` and `approval`. `rawApi` resolves as a whole object from the first level that declares it: Project > Workspace > Defaults > Built-in. This avoids accidentally combining `enabled: true` from one scope with broad allow patterns from another.

`approval.openDebounceMs` affects only browser auto-open. Every approval request still emits an `APPROVAL_PENDING` event with its URL on stderr.

### Raw API fallback

Raw API is disabled by default. To use `siyuan api raw`, configure both `enabled: true` and at least one allowed endpoint pattern:

```yaml
behavior:
  rawApi:
    enabled: true
    allow:
      - "attr.batch*"
      - "block.getDocInfo"
      - "filetree.getFullHPathByID"
```

Allowing all raw endpoints is supported but must be explicit:

```yaml
behavior:
  rawApi:
    enabled: true
    allow:
      - "*"
```

Example call:

```bash
siyuan api raw block.getDocInfo -j '{"id":"20230315180000-abcdefg"}'
```

Raw output is always pure JSON on stdout so it can be piped to `jq`. Raw safety warnings are written to stderr.

### CI / agent usage

For CI pipelines or agent sandboxes where no browser is available:

```yaml
workspaces:
  ci-agent:
    behavior:
      allowYes: true         # CI agent trusts --yes
      approval:
        autoOpen: false      # no browser in CI
        openDebounceMs: 0    # irrelevant when autoOpen is false
```

> [!Note]
> `allowYes: true` means `--yes` bypasses the Approval Center. For safety, set `allowYes: false`
> to enforce the approval flow and disable the `--yes` bypass. See `permission.md` for how risk-based
> auto-approval interacts with this.

## Project config (`.siyuan-cli.yaml`)

Drop at project root to pin workspace, override behavior, and optionally add permission rules per directory tree.

```yaml
schemaVersion: 1
workspace: prod              # optional; must exist in global config
behavior:                    # optional; merged with workspace/defaults behavior
  allowYes: false            # enforce approval flow for this project
  approval:
    timeout: 30
  # rawApi:                  # optional; project-level raw fallback opt-in
  #   enabled: true
  #   allow: ["block.getDocInfo"]
# permission:                # optional; see permission.md for full reference
#   default: allow
#   rules:
#     - endpoint: "block.delete*"
#       effect: deny
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

Output includes `source`, active workspace, project config path (if found), and the full resolved rule list (if permission rules are configured).

## Quick verification

```bash
siyuan workspace list                    # all configured workspaces
siyuan workspace which                   # current resolution (no network)
siyuan workspace verify                  # verify effective workspace for current directory
siyuan workspace verify <name>           # verify an explicit workspace by name
siyuan workspace verify --global-current # verify global config.current only
```

`workspace verify` (no args) follows effective resolution for the current directory:
`$SIYUAN_CLI_WORKSPACE` env → `.siyuan-cli.yaml` → `config.current`.
Its output includes `source` and `projectConfigPath` so you can see where the active target came from.

## Related docs

- [`permission.md`](permission.md) — permission rules, risk-based auto-approval, extension schema coupling
- [`cli-overview.md`](cli-overview.md) — Approval Center commands and broker lifecycle
- `recipes/connect-workspace.md` — step-by-step workspace setup recipe

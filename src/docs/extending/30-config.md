---
title: Config and Permission Model
slug: config-and-permission
summary: config.yaml structure, workspace entries, token sources, and the permission model that guards enforce.
---

# Config and Permission Model

GATE: read this before writing a new guard or debugging a `CONTENT_ACCESS_DENIED` error.

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
  endpoints:
    allow: ["query.*", "block.get*", "filetree.list*"]
    deny:  ["system.exit"]
  tools:
    allow: ["resolve-path", "list-doc-tree"]
    deny:  ["append-content"]
  content:
    read:
      notebooks:
        allow: ["20260101215354-j0c5gvk"]
        deny:  []
      paths:
        allow: ["/journal/**"]
        deny:  ["/journal/private/**"]
    write:
      notebooks:
        deny: ["20260101215354-j0c5gvk"]
  workspace:
    read:
      paths:
        allow: ["/assets/**"]
        deny:  ["/conf/**"]
    write:
      paths:
        deny: ["/**"]                   # read-only workspace
  confirm:
    modes: [write, invoke]
    surfaces: [workspace, network]
    scopes: [global, batch]
```

### `endpoints` / `tools`

- matched by `micromatch` against endpoint id (`query.sql`, `block.updateBlock`) or tool id (`list-doc-tree`)
- `allow` (if non-empty) is a whitelist: only matching ids pass
- `deny` removes matching ids from what `allow` admits
- leaving the whole block out means "no restriction"

### `content.{read,write}` — block/doc/notebook scope

Applies to `ResourceKind` values `id`, `notebook`, `path`. When a guard calls `engine.checkContentRef({kind, value, access})`:

- `notebooks.{allow,deny}` use exact id match
- `paths.{allow,deny}` use `micromatch` glob match against the SiYuan-internal `path` (`/abc-xxx/def-yyy.sy`)

For a block id, the engine resolves to `{notebook, path}` via SQL lookup (cached per engine instance), then applies the same checks.

### `workspace.{read,write}` — filesystem scope

Applies to `ResourceKind = "workspace-path"`, used by `/api/file/*`, `/api/export/*`, `/api/template/render`. Same `paths.{allow,deny}` glob syntax.

### `confirm` — additional confirmation triggers

`engine.requiresConfirmation(entry)` returns `true` if **either**:

- `entry.meta.requiresConfirmation` (risk-derived: `destructive` or `critical`), **or**
- any of `confirm.modes` / `confirm.surfaces` / `confirm.scopes` contains the endpoint's classification value

The user's `confirm` block can only **add** confirmation points, never remove them. Use it to, for example, also confirm every `write` even when the risk is merely `elevated`.

## Permission error taxonomy

| Error | Source | Cause |
|---|---|---|
| `ENDPOINT_DISABLED` | `checkEndpoint()` | endpoint id blocked by `endpoints.allow/deny` |
| `TOOL_DISABLED` | `checkTool()` | tool id blocked by `tools.allow/deny` |
| `CONTENT_ACCESS_DENIED` | `checkContentRef()` with `kind in {id, notebook, path}` | content scope violation |
| `WORKSPACE_ACCESS_DENIED` | `checkContentRef()` with `kind = workspace-path` | workspace scope violation |
| `CONFIRMATION_REQUIRED` | `executeEndpoint()` | needs `--yes` |
| `BLOCK_NOT_FOUND` | id resolution | id doesn't exist in the kernel |

Exit code `5` (`ExitCode.PERMISSION`) applies to hard policy denials: `ENDPOINT_DISABLED`, `TOOL_DISABLED`, `CONTENT_ACCESS_DENIED`, and `WORKSPACE_ACCESS_DENIED`.
`BLOCK_NOT_FOUND` and `CONFIRMATION_REQUIRED` are categorized as general failures and exit with code `1`.

## Defaults cascade

Workspace resolution for `PermissionConfig`:

```ts
// src/core/permission.ts
const merged = {
  endpoints: ws.permission?.endpoints ?? defaults?.endpoints,
  tools:     ws.permission?.tools     ?? defaults?.tools,
  content: {
    read:  ws.permission?.content?.read  ?? defaults?.content?.read,
    write: ws.permission?.content?.write ?? defaults?.content?.write,
  },
  workspace: {
    read:  ws.permission?.workspace?.read  ?? defaults?.workspace?.read,
    write: ws.permission?.workspace?.write ?? defaults?.workspace?.write,
  },
  confirm:   ws.permission?.confirm   ?? defaults?.confirm,
};
```

Each block is all-or-nothing: declaring workspace-level `content.read` replaces the default completely for that field. There is no deep merge.

## Debugging a permission denial

1. `siyuan api <id> --debug` — shows the endpoint id and payload
2. note the kind/value printed in the error message (e.g. "path /foo in read deny list")
3. look up `workspaces.<name>.permission` or `defaults.permission` in the config
4. `micromatch` rules: `**` matches across `/`, `*` does not cross `/`, `?` matches one char

## Glob cheat sheet

| Pattern | Matches |
|---|---|
| `/journal/**` | `/journal/x.sy`, `/journal/a/b.sy` |
| `/journal/*` | `/journal/x.sy` (one level only) |
| `query.*` | `query.sql` (not `queryx.sql`) |
| `block.get*` | `block.getBlockKramdown`, `block.getBlockInfo` |
| `!query.*` | **not** supported by this engine — use the `deny` list |

## One-line summary

**Config is layered: workspace overrides defaults. Permission is layered: risk-auto confirmation unions user `confirm` policy. Guards consult the engine, the engine consults the config.**

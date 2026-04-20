---
title: Workspace Resolution
slug: workspace-resolution
summary: How siyuan-cli determines the active workspace per invocation, including .siyuan-cli.yaml discovery and permission override rules.
---

# Workspace Resolution

GATE: read when the workspace picked by an invocation doesn't match what you expected, or when designing how an agent anchors its target workspace across sessions.

## Resolution chain

```text
--workspace flag
  > $SIYUAN_CLI_WORKSPACE env
  > .siyuan-cli.yaml    (walk up from cwd; do NOT read $HOME)
  > config.current      (global YAML fallback; emits IMPLICIT_WORKSPACE on writes)
```

`--baseUrl` short-circuits everything else and yields an ad-hoc workspace with `source = "ad-hoc"`. No project file is consulted, no permission is inherited.

**Why `--baseUrl` skips project-file permission**: an ad-hoc URL may point at a kernel that has nothing in common with the current project — different notebooks, different ids, possibly a completely unrelated workspace. Project permission rules are anchored to specific notebook ids and id-based paths, so forcing them onto an unknown kernel would be either incoherent (rules reference ids that don't exist there and silently match nothing) or silently wrong (rules happen to match unrelated blocks). Ad-hoc mode is a diagnostic/emergency escape hatch — "talk to this URL with these credentials, no other assumptions". If you want project permission to apply, use `--workspace <name>` instead: that route respects the project file's permission block regardless of which workspace name was ultimately chosen (see "Independence of workspace selection and permission" below).

## ResolvedWorkspace.source

Each invocation produces a `ResolvedWorkspace` with a `source` tag describing which step of the chain won:

| `source` | Meaning |
|---|---|
| `flag` | picked by `--workspace` |
| `env` | picked by `$SIYUAN_CLI_WORKSPACE` |
| `project-file` | picked by `workspace:` in a discovered `.siyuan-cli.yaml` |
| `global-current` | fell through to `config.current` |
| `ad-hoc` | `--baseUrl` was used; no named workspace involved |

The source is threaded through to the guard layer so that write-like operations resolved via `global-current` emit an `IMPLICIT_WORKSPACE` warning (see below).

## `.siyuan-cli.yaml` discovery

`siyuan` walks upward from the current directory looking for a `.siyuan-cli.yaml`. It stops at the first match, or when any of these is reached:

- the user's `$HOME` (exclusive — `~/.siyuan-cli.yaml` is never read)
- the filesystem root
- `MAX_WALK_DEPTH = 32`

Example layout:

```text
monorepo/
  .siyuan-cli.yaml        # workspace: prod
  subproject-a/
    .siyuan-cli.yaml      # workspace: dev
  subproject-b/
    (no project file)
```

Invocation behavior:

| cwd | Found file | Active workspace (assuming no `--workspace` / env) |
|---|---|---|
| `monorepo/` | `monorepo/.siyuan-cli.yaml` | `prod` |
| `monorepo/subproject-a/` | `subproject-a/.siyuan-cli.yaml` | `dev` |
| `monorepo/subproject-b/` | `monorepo/.siyuan-cli.yaml` | `prod` (walked up to the shared file) |
| `/unrelated/` | none | falls back to `config.current` |

Resolution does **not** merge files found on the way up — first hit wins.

## File format

```yaml
schemaVersion: 1            # required; must equal 1
workspace: prod             # optional; must exist in global config.workspaces
permission:                 # optional; same shape as global permission block
  default: deny
  rules:
    - endpoint: "system.exit"
      effect: deny
    - notebook: "20260101-aaa"
      path: "/20260107143325-zbrtqup/**"
      effect: deny
```

## Field rules (hard-enforced at load time)

| Field | Rule | On violation |
|---|---|---|
| `schemaVersion` | must equal `1` | `PROJECT_CONFIG_VERSION_UNSUPPORTED` (exit 2) |
| `workspace` | must be a string and exist in `config.workspaces` | `PROJECT_CONFIG_WORKSPACE_NOT_FOUND` (exit 2) |
| `token` / `baseUrl` / `tokenSource` / `defaults` | never allowed | `PROJECT_CONFIG_REJECTED_FIELD` (exit 2) |
| unknown top-level keys | allowed but flagged | stderr warning `UNKNOWN_PROJECT_CONFIG_KEY` |
| `permission.rules[*].notebook` entries | must match kernel id pattern `^\d{14}-[0-9a-z]{7}$` | stderr warning `LIKELY_HPATH_NOT_ID` |
| `permission.rules[*].path` entries | must contain a kernel id segment | stderr warning `LIKELY_HPATH_NOT_ID_IN_PATH` |
| YAML parse failure | never OK | `PROJECT_CONFIG_PARSE_ERROR` (exit 2) |

**Rationale for rejecting connection fields**: by construction, the project file cannot hold credentials. It is safe to commit. The global config (`~/.config/siyuan-cli/config.yaml`) is the sole source of `baseUrl` / `token`.

## Permission override semantics

When a project file declares `permission`, its rules are **prepended** to the cascade:

```
final rules   = project.rules ++ workspace.rules ++ defaults.rules
final default = project.default ?? workspace.default ?? defaults.default ?? "deny"
```

Project rules come first → highest priority. Global workspace and defaults rules still apply after them. This means a project file can add targeted exceptions (deny a specific subtree, require confirm for a tool) without having to re-declare everything.

If you want the project to completely seal off everything not explicitly allowed, set `default: deny` in the project file and write an explicit allow list in `rules`.

## Independence of workspace selection and permission

The project file's `permission` block is **independent of how the workspace name was determined**. If you run:

```sh
cd projectA                          # .siyuan-cli.yaml says workspace: dev, permission: { ... }
siyuan --workspace prod api query.sql "..."
```

then:

- the workspace becomes `prod` (source: `flag`)
- the project's `permission` block **still applies**
- `resolved.source = "flag"` but `resolved.projectConfigPath` is still set

Rationale: `--workspace` expresses "I want a different target right now", while the project file expresses "whenever I operate from this directory, these rules apply". They are orthogonal, and honoring both is the safe interpretation.

## The `IMPLICIT_WORKSPACE` warning

Emitted to stderr when **both** are true:

1. `resolved.source === "global-current"` (the lowest priority source)
2. the endpoint's derived risk is `elevated`, `destructive`, or `critical`

```json
{"warning":"IMPLICIT_WORKSPACE","endpoint":"block.updateBlock","workspace":"home","risk":"elevated","hint":"Resolved from global config.current. Pass --workspace, set $SIYUAN_CLI_WORKSPACE, or add .siyuan-cli.yaml to anchor the target."}
```

Why risk-based and not mode-based:

- `sensitive` reads (e.g. `block.getBlockKramdown`) don't warn — reading the wrong workspace is annoying but not destructive.
- `notification.pushMsg` (`riskOverride: "safe"`) doesn't warn — UI toast on the wrong window at worst.
- `system.exit` (`riskOverride: "critical"`) **does** warn — killing the wrong kernel is a real incident.

The warning does not change exit code. Agents should treat it as a signal to add `--workspace` or a project file.

## Debugging: `siyuan workspace which`

Read-only observation of the current directory's resolution:

```sh
$ cd ~/projects/myproj
$ siyuan workspace which
{
  "workspace": "prod",
  "source": "project-file",
  "baseUrl": "http://127.0.0.1:6806",
  "hasToken": true,
  "projectConfigPath": "/home/user/projects/myproj/.siyuan-cli.yaml",
  "permissionOverriddenByProject": true,
  "permission": {
    "default": "deny",
    "ruleCount": 3,
    "rules": [
      { "index": 0, "endpoint": "block.delete*", "effect": "deny" },
      { "index": 1, "notebook": "20260101-aaa", "action": "read", "effect": "allow" },
      { "index": 2, "effect": "deny" }
    ]
  }
}
```

This command does not touch the kernel and does not modify any state. Safe to run in any agent context.

## gitignore strategy

Two patterns, pick one per project:

1. **Shared** — commit `.siyuan-cli.yaml`. All collaborators automatically use the same workspace name.
2. **Personal** — gitignore `.siyuan-cli.yaml`, commit `.siyuan-cli.yaml.example`. Each developer copies and customizes locally.

Both are safe because the file cannot contain credentials. Pick shared when "the right workspace for this project" is a property of the project; pick personal when it is a property of the user.

## What is NOT added

From the original design (request `26-04-17T20-24_workspace-session-isolation.md`):

- **No `siyuan workspace use --local` command**: manual YAML edit is simpler; the subcommand introduces create-or-update ambiguity. Reconsider after user feedback.
- **No merge with `~/.siyuan-cli.yaml`**: redundant with global XDG config.
- **No three-layer permission merge**: project file replaces, period.
- **No aliasing of notebook ids**: revisit only if users report real readability pain.

## One-line summary

**`.siyuan-cli.yaml` anchors the workspace and permission model to a directory tree. First hit while walking up from cwd wins. Safe to commit. `workspace which` to inspect.**

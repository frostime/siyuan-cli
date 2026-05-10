---
name: workspace-resolution
description: "Workspace resolution chain: flag → env → project-file → global-current, project-file discovery, permission override independence, workspaceDir port discovery, and IMPLICIT_WORKSPACE warning design."
updated: 2026-05-04
scope:
  - /src/workspace/resolve.ts
  - /src/workspace/project-config.ts
  - /src/workspace/resolver.ts
  - /src/workspace/config.ts
deprecated: false
replacement: ""
---

# Workspace Resolution

## Overview

Each CLI invocation resolves a single `ResolvedWorkspace` that names the target kernel and carries credentials. Resolution is a deterministic cascade of five sources, with a separate project-file discovery pass layered between two of them.

Two separate concerns share the workspace concept:
- **Which kernel** (name → baseUrl) — resolved by the cascade
- **What permission rules** — optionally overridden by a project file, independently of which kernel was chosen

---

## Resolution chain

```text
--workspace flag        (highest)
  → $SIYUAN_CLI_WORKSPACE env
  → .siyuan-cli.yaml    (walk up from cwd)
  → config.current      (lowest — emits IMPLICIT_WORKSPACE on writes)
```

`--baseUrl` short-circuits everything → `source: 'ad-hoc'`. No project file, no permission.

### Implementation detail

The base resolver (`resolveWorkspace`) handles flag → env → global-current. It does not know about project files. The effective resolver (`resolveEffectiveWorkspace`) layers project-file discovery by pre-filling `overrides.workspace` when neither flag nor env provided a name, then correcting the `source` tag to `'project-file'` after the base resolver returns.

This indirection is intentional: workspace-management commands (`add`, `list`, `use`, `remove`) call `resolveWorkspace` directly — they operate on the global config and should not be influenced by the current directory.

---

## `ResolvedWorkspace.source`

| Source | Meaning |
|---|---|
| `flag` | `--workspace` CLI flag |
| `env` | `$SIYUAN_CLI_WORKSPACE` |
| `project-file` | `workspace:` in a discovered `.siyuan-cli.yaml` |
| `global-current` | fell through to `config.current` |
| `ad-hoc` | `--baseUrl`; no named workspace involved |

The source is threaded to the guard layer for the `IMPLICIT_WORKSPACE` warning.

---

## Project-file discovery

`findProjectConfig(cwd)` walks upward from cwd looking for `.siyuan-cli.yaml`.

**Stop conditions** (first match wins):
1. File found
2. Directory equals `$HOME` (exclusive — `~/.siyuan-cli.yaml` is never read)
3. Filesystem root reached
4. `MAX_WALK_DEPTH = 32` iterations elapsed

**Why stop at `$HOME`**: the global XDG config (`~/.config/siyuan-cli/config.yaml`) owns that semantic space. A `.siyuan-cli.yaml` in `$HOME` would collide — two files claiming to define workspace/permission for the same scope.

**No merge**: first file found wins. Walking past it to a parent file is not supported. Rationale: merge semantics create implicit precedence that is hard to debug; a single file is fully inspectable via `siyuan workspace which`.

---

## Project-file field rules

Hard-enforced at load time (`loadProjectConfig`):

| Field | Rule | Error |
|---|---|---|
| `schemaVersion` | must equal `1` (missing is also an error) | `PROJECT_CONFIG_VERSION_UNSUPPORTED` |
| `workspace` | must be a string; must exist in `config.workspaces` | `PROJECT_CONFIG_WORKSPACE_NOT_FOUND` |
| `token`, `baseUrl`, `tokenSource`, `defaults` | never allowed | `PROJECT_CONFIG_REJECTED_FIELD` |

**Why reject connection fields**: the project file is designed to be committable. Credentials and connection overrides belong in the global config (`~/.config/siyuan-cli/config.yaml`) which is user-private.

Soft warnings (stderr, non-fatal):
- `UNKNOWN_PROJECT_CONFIG_KEY` — forward compatibility for unknown top-level keys
- `LIKELY_HPATH_NOT_ID` / `LIKELY_HPATH_NOT_ID_IN_PATH` — same smoke-test as global config
- `LIKELY_PATH_MISSING_SY_SUFFIX` — path rule missing `.sy` on leaf id segment
- `ROOT_ID_OVERRIDES_PATH` — both `root_id` and `path` set; `root_id` wins

---

## Permission override independence

When a project file declares `permission`, its rules are **prepended** to the rule list and its `default` overrides the fallback:

```
final rules   = project.rules ++ workspace.rules ++ defaults.rules
final default = project.default ?? workspace.default ?? defaults.default ?? "allow"
```

Because evaluation is first-match-wins, project rules shadow workspace/defaults rules for any context they cover. Workspace/defaults rules remain in the list and still apply to contexts the project rules did not match.

This replacement is **independent of how the workspace name was determined**. If `--workspace prod` overrides the workspace but a `.siyuan-cli.yaml` in cwd declares permission, the project's permission still applies.

**Design rationale**: `--workspace` expresses "use a different target right now". The project file expresses "whenever I operate from this directory, these rules apply". These are orthogonal concerns. Honoring both is the safe interpretation — switching targets should not silently disable directory-scoped guardrails.

The same independence applies to `behavior` fields declared in the project file — they merge with workspace/defaults behavior at field level. One notable exception is `behavior.rawApi`, which is resolved as a whole object (enabled + allow patterns) rather than field-by-field so that raw authorization stays explicit.

---

## Token resolution

Priority (highest wins):

```text
--token flag
  → $SIYUAN_CLI_TOKEN env
  → tokenSource (env | file | command)
  → literal token in config
```

`tokenSource` is resolved per-invocation by `resolveTokenSource`:
- `env`: reads `process.env[value]`
- `file`: reads first line of the file
- `command`: executes the command and trims stdout

---

## Workspace connection modes

Each workspace needs a connection target. Two fields provide it:

- `baseUrl` — explicit URL. Best when the port is known.
- `workspaceDir` — absolute path to the SiYuan workspace directory. Only for local instances. The CLI auto-discovers the runtime port.

When both are present, `baseUrl` takes priority.

### `workspaceDir` port discovery (4-step)

Implemented in `resolver.ts`:

1. POST `/api/system/getWorkspaces` via seed port (default 6806) → get all running workspace paths
2. Match `workspaceDir` against returned paths (full path or basename; case-insensitive)
3. Read `<workspaceDir>/conf/conf.json` → extract `serverAddrs` → pick localhost port
4. Verify via `POST /api/system/getConf` on the discovered port (workspaceDir consistency check)

The `MaterializedWorkspace` always has a concrete `baseUrl` by the time `SiyuanClient` sees it.

---

## `IMPLICIT_WORKSPACE` warning

Emitted when **both**:
1. `resolved.source === 'global-current'` (lowest priority)
2. endpoint risk is `elevated`, `destructive`, or `critical`

**Why risk-based, not mode-based**:
- `sensitive` reads don't warn — reading the wrong workspace is annoying but not destructive
- `notification.pushMsg` (`riskOverride: safe`) doesn't warn — UI toast on the wrong window at worst
- `system.exit` (`riskOverride: critical`) does warn — killing the wrong kernel is a real incident

The warning does not change exit code. Agents should treat it as a signal to add `--workspace` or a project file.

---

## Raw API behavior note

`behavior.rawApi` is an explicit opt-in gate for `siyuan api raw`.

- It can be declared in project or workspace behavior, alongside normal workspace resolution.
- It resolves as a whole object from the first layer that defines it.
- It does not use the normal permission rule-list model; raw access is authorized by config allowlist, not by `permission.rules`.
- Example: `behavior.rawApi.enabled: true` + `behavior.rawApi.allow: ["block.getDocInfo"]` permits `siyuan api raw block.getDocInfo`.

## Key files

| File | Role |
|---|---|
| `src/workspace/resolve.ts` | `resolveWorkspace`, `resolveEffectiveWorkspace`, `materializeWorkspace` |
| `src/workspace/project-config.ts` | `findProjectConfig`, `loadProjectConfig`, field validation, smoke warnings |
| `src/workspace/resolver.ts` | `resolveWorkspaceDirToBaseUrl` (4-step port discovery) |
| `src/workspace/config.ts` | `loadConfig`, `cascadePermission`, workspace entry management |

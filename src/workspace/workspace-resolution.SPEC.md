---
name: workspace-resolution
summary: Maintenance contract for workspace selection, project-file overlays, credentials, and local workspaceDir materialization.
updated: 2026-08-10
scope:
  - /src/workspace/**
  - /src/api/guard.ts
  - /src/shared/permission.ts
---

# Workspace Resolution Specification

## Boundary

Workspace resolution has two stages:

1. **Selection** chooses the logical target and records its provenance in `ResolvedWorkspace`.
2. **Materialization** turns a selected `workspaceDir` into a live `baseUrl` before a Kernel request.

Workspace-management commands use `resolveWorkspace()` directly. Business commands (`api` and `tool`) use `resolveEffectiveWorkspace()` and then `materializeWorkspace()`. This split prevents the current directory's project file from changing global workspace-management operations.

## Selection contract

For a business invocation, the effective priority is:

```text
--baseUrl
  → --workspace
  → $SIYUAN_CLI_WORKSPACE
  → .siyuan-cli.yaml workspace:
  → config.current
```

`--baseUrl` is ad-hoc mode: it short-circuits project-file discovery and permission overlays. A named workspace records one of these sources: `flag`, `env`, `project-file`, or `global-current`; the source is later used by the guard warning policy.

`--workspace` and `SIYUAN_CLI_WORKSPACE` outrank a project-file workspace. A project file supplies the workspace only when neither higher-priority source selected one.

## Project-file contract

`findProjectConfig(cwd)` walks upward and returns the first `.siyuan-cli.yaml` it finds. It stops before reading `$HOME/.siyuan-cli.yaml`, at the filesystem root, or after 32 levels. It does not merge multiple project files.

The project file is intentionally committable:

- `schemaVersion` must be `1`;
- `workspace`, `permission`, and `behavior` are allowed;
- `token`, `baseUrl`, `tokenSource`, and `defaults` are rejected;
- unknown keys and suspicious ID/hpath values produce non-fatal warnings;
- a project `workspace` must name a workspace present in the global config.

Project permission remains independent of workspace-name selection. If a caller passes `--workspace prod` while the current project declares permission rules, those project rules still apply to the invocation. Project rules are prepended to workspace/default rules and the project default takes precedence. Project behavior fields merge by field, except `rawApi`, which resolves as a whole object from the first layer that defines it.

## Credentials

For a named workspace, token priority is:

```text
--token
  → $SIYUAN_CLI_TOKEN
  → tokenSource (env | file | command)
  → literal workspace token
```

Credentials belong to global workspace configuration, not project files.

## Connection materialization

A workspace with `baseUrl` uses it directly. When both `baseUrl` and `workspaceDir` are present, `baseUrl` wins.

A local `workspaceDir` is materialized as follows:

```text
workspaceDir/conf/conf.json
  → read serverAddrs and select a 127.0.0.1 port
  → POST /api/system/getWorkspaceInfo on that port
  → compare the returned runtime workspaceDir with the configured path
  → return http://127.0.0.1:<port>
```

The verification request carries the resolved workspace token. Path comparison is normalized and case-insensitive on Windows. The resolver does not start SiYuan and does not use a default seed Kernel; a missing configuration, missing port, unreachable Kernel, or mismatched runtime workspace is a resolution failure.

The verification step is required even though the port comes from `conf.json`: a stale or reused port must not silently connect a command to another workspace.

## Implicit-target warning

`IMPLICIT_WORKSPACE` is emitted when all of the following hold:

- the selected source is `global-current`;
- the endpoint is not a low/medium-severity read.

The warning is non-fatal. It asks the caller to pass `--workspace`, set `SIYUAN_CLI_WORKSPACE`, or add a project file so the target is explicit.

## Change constraints

When changing this module:

- keep selection provenance separate from connection materialization;
- do not let project-file discovery affect workspace-management commands;
- do not allow project files to carry credentials or connection overrides;
- preserve permission/behavior overlays when a workspace is explicitly selected;
- keep `workspaceDir` verification tied to the runtime workspace identity, not merely port reachability;
- preserve stable configuration errors and warning semantics; see `/.dev/docs/error-model.md`.

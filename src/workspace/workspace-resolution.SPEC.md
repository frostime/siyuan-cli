---
name: workspace-resolution
summary: Maintenance contract for workspace selection, project-file overlays, credentials, and local workspaceDir materialization.
updated: 2026-09-08
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
  → caller process binding + .siyuan-cli.yaml workspace:
      both select a workspace → they must name the same one;
      disagreement fails with CURRENT_SELECTION_CONFLICT (exit 2)
  → config.current
```

`--baseUrl` is ad-hoc mode: it short-circuits project-file discovery, process binding, and permission overlays. A named workspace records one of these sources: `flag`, `env`, `project-file`, `process-binding`, or `global-current`; the source is later used by the guard warning policy.

`--workspace` and `SIYUAN_CLI_WORKSPACE` outrank both the binding and a project-file workspace, with no agreement check against them. When the binding and the project file agree (or only one of them selects), the selected name applies; an agreeing pair reports `process-binding` as the source and carries anchor diagnostics in `ResolvedWorkspace.binding`.

## Process binding

A caller can attach a catalog workspace to its observable OS process scope through `siyuan-cli current bind` and a separate `confirm` invocation. `src/workspace/binding/process-tree.ts` owns process identity and ancestry semantics; `src/workspace/binding/observation.ts` and its platform modules own host evidence; `src/workspace/binding/state.ts` owns persistence; and `src/workspace/binding/protocol.ts` owns lifecycle and active lookup. Resolution consumes `findActiveBinding()` and does not interpret platform stop reasons or read binding files directly. See `/.dev/docs/process-binding.md` for the cross-module maintenance model.

Constraints:

- `--baseUrl`, `--workspace`, and `SIYUAN_CLI_WORKSPACE` return before binding state or process observation is consulted;
- binding state lives under the config directory's `process-binding/` folder and never in `config.yaml`;
- if no confirmed record remains after stale reclamation, active lookup returns no binding without capturing caller ancestry;
- a confirmed record is stale only when its PID is absent or an authoritative start identity proves PID reuse; incomplete identity or query failure is unknown and the record is retained;
- a reliable anchor match selects the binding; complete ancestry that conclusively rules out every retained anchor may fall through; incomplete or unresolved no-match fails before any Kernel request;
- the anchor is a process instance, matched by PID + start identity, degrading to PID + command signature; bare PID never matches;
- `current cancel <nonce>` removes only one pending confirmation without process observation; `current unbind` removes only confirmed records matching the caller scope and does not remove pending state;
- a bound workspace that is missing from the catalog fails with `WORKSPACE_NOT_FOUND`;
- process binding is explicit selection provenance, not authorization — permission, token, and approval behavior follow the selected workspace.

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

The warning is non-fatal. It asks the caller to pass `--workspace`, set `SIYUAN_CLI_WORKSPACE`, or add a project file so the target is explicit. `process-binding` and `project-file` are explicit sources and never trigger this warning.

## Change constraints

When changing this module:

- keep selection provenance separate from connection materialization;
- do not let project-file discovery affect workspace-management commands;
- do not let the process binding affect workspace-management commands either;
- do not allow project files to carry credentials or connection overrides;
- preserve permission/behavior overlays when a workspace is explicitly selected;
- keep `workspaceDir` verification tied to the runtime workspace identity, not merely port reachability;
- preserve stable configuration errors and warning semantics; see `/.dev/docs/error-model.md`.

---
title: Current workspace selection
slug: current
summary: Select, inspect, verify, and bind the workspace used by a CLI call.
---

# Current workspace selection

`workspace` manages named connections in the catalog. `current` answers a different question: **which workspace will this call use?**

## Choose a selection scope

Use the narrowest scope that covers the work:

| Situation | Selection | Notes |
|---|---|---|
| One or a few API/tool calls | `--workspace <name>` | Applies to that business invocation only. |
| Repeated work in one project | `.siyuan-cli.yaml` with `workspace: <name>` | Project-local and safe to commit; it cannot contain credentials. |
| Long-lived work without a project file | Process binding | Use the two-step `bind` → independent `confirm` flow below. |
| Deliberately change the machine default | `current global <name>` | Writes shared `config.current`; it is not an isolation mechanism. |

Before content work, run `siyuan-cli current which`. For a write, the resolved workspace must match the user's intent. If resolution falls back to the machine-wide `config.current` and the user has not specified that target, ask before writing rather than guessing.

The business-call selection order is:

```text
--baseUrl → --workspace → $SIYUAN_CLI_WORKSPACE
  → project workspace / process binding
  → config.current
```

A project file and process binding may coexist. If they select the same name, the selection is valid. If they select different names, resolution fails with `CURRENT_SELECTION_CONFLICT`; use an explicit `--workspace <name>` for a one-call exception, or fix the project/binding conflict.

`--baseUrl` is ad-hoc mode: it bypasses named workspace selection, project discovery, process binding, and permission overlays.

## Commands

### `current which`

```bash
siyuan-cli current which
```

Reports the resolved workspace, selection `source`, base URL or workspace directory, project config path, and process-binding diagnostics when present. It performs no network request and does not print the resolved permission rule list. Inspect `config.yaml` or `.siyuan-cli.yaml` for those rules.

### `current verify`

```bash
siyuan-cli current verify
```

Resolves the effective selection for this call and verifies that its Kernel can be reached. It accepts no workspace name. Use `siyuan-cli workspace verify <name>` for one catalog entry or `siyuan-cli workspace verify --all` for all entries.

### `current global <name>`

```bash
siyuan-cli current global <name>
```

Sets `config.current`, the machine-global fallback. It changes shared local configuration and does not create a process binding. Use it only when changing the default is intentional. It is the replacement for the deprecated `workspace use <name>` alias.

## Process binding

Process binding is for a long-lived caller scope that has no project workspace anchor. It attaches an existing catalog workspace to an observable OS process scope, so later `api` and `tool` calls in that scope can omit `--workspace`. It is not a logical Agent/session identity or an authorization mechanism; permission, token, and approval behavior still come from the selected workspace.

One OS process can host several logical callers. They share a binding by contract. If that separation is not acceptable, use a project file or explicit `--workspace` instead.

### Bind, use, and release

Run the two commands as separate CLI invocations from the same caller scope:

```text
siyuan-cli current bind dev
  → prints a one-time nonce
siyuan-cli current confirm <nonce>
  → binds dev to the process scope
siyuan-cli current which
  → source: process-binding
siyuan-cli api ...
  → no --workspace needed in this scope
siyuan-cli current unbind
  → release the binding before ending the task
```

`current bind <name>` accepts only a workspace already present in the catalog. It captures the first call's process ancestry and creates a pending probe. `current confirm <nonce>` must run in a new independent call; it pairs the probe with the second ancestry and chooses the nearest identifiable common process instance. A same-process confirm is rejected.

The pending nonce expires after 15 minutes. If it expires, start a new bind. If the two calls have no usable common ancestor, use a project file or explicit `--workspace` instead. The binding becomes inactive when its anchor process exits, but do not rely on that for task cleanup: **after using bind, always run `siyuan-cli current unbind` manually before ending the task.** `unbind` removes bindings matching the current process scope and cancels pending probes.

If a project workspace and a pending or confirmed binding disagree, bind/confirm or business resolution fails with `CURRENT_SELECTION_CONFLICT`; do not silently choose one. `current which` is the no-network way to inspect the result.

## Windows shell note

There are two unrelated MSYS/Git Bash issues:

- MSYS path conversion can rewrite arguments that begin with `/`; use `MSYS_NO_PATHCONV=1` or the `//path` form described in `cli-overview.md`.
- The MSYS/Git Bash fork layer can truncate the Windows ancestry visible to the CLI. In that environment `current bind` may succeed but `current confirm` can fail with `PROCESS_BINDING_NO_COMMON_ANCESTOR`. Use a native PowerShell or cmd shell for the two-step binding flow. The `pnpm run` wrapper is not the cause; the complete flow works through pnpm in a native Windows shell.

## Selection errors

| Code | Meaning | Next action |
|---|---|---|
| `CURRENT_SELECTION_CONFLICT` | Project and process binding select different workspaces. | Use explicit `--workspace` for one call, or fix the project/binding. |
| `PROCESS_BINDING_PENDING_NOT_FOUND` | The nonce is missing or unusable. | Start `current bind <name>` again. |
| `PROCESS_BINDING_PENDING_EXPIRED` | The 15-minute pending window elapsed. | Start the two-step flow again. |
| `PROCESS_BINDING_SAME_CALL` | Bind and confirm ran in one process. | Confirm in a new independent CLI call. |
| `PROCESS_BINDING_NO_COMMON_ANCESTOR` | The calls do not share a usable process ancestor. | Run both calls in the same shell/Agent scope, or use `--workspace`. |
| `PROCESS_BINDING_ANCHOR_UNIDENTIFIABLE` | The common ancestor cannot be identified reliably. | Retry the flow; otherwise use a project file or `--workspace`. |
| `PROCESS_TREE_UNSUPPORTED` | The platform has no supported ancestry implementation. | Use a project file or explicit `--workspace`. |
| `PROCESS_TREE_UNAVAILABLE` | Ancestry capture failed at runtime. | Retry; if it persists, use a project file or `--workspace`. |
| `VERIFY_MODE_CONFLICT` | A selection verification command received a named-connection mode. | Use `current verify` without a name, or `workspace verify <name|--all>`. |

## Related commands and docs

- `siyuan-cli workspace list` — list catalog entries.
- `siyuan-cli workspace verify <name|--all>` — verify named catalog connections.
- `siyuan-cli current which` — inspect selection without network access.
- `cli-overview.md` — common CLI flags, output channels, and general errors.
- `workspace-config.md` — global config, project file, token, behavior, and permission configuration.
- `recipes/connect-workspace.md` — first connection and selection setup.

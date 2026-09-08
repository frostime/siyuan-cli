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

Before content work, run `siyuan-cli current which` to inspect persistent/ambient selection. For a one-off business call with explicit `--workspace <name>`, the flag determines that call's target and `current which` does not preview it. For other writes, the resolved workspace must match the user's intent. If resolution falls back to machine-wide `config.current` and the user has not specified that target, ask before writing rather than guessing.

The business-call selection order is:

```text
--baseUrl → --workspace → $SIYUAN_CLI_WORKSPACE
  → project workspace / process binding
  → config.current
```

A project file and process binding may coexist. If they select the same name, the selection is valid. If they select different names, resolution fails with `CURRENT_SELECTION_CONFLICT`; use an explicit `--workspace <name>` for a one-call exception, or fix the project/binding conflict.

`--baseUrl` is ad-hoc mode: it bypasses named workspace selection, project discovery, process binding, and permission overlays.

## Commands

`current` commands print compact Agent-facing text by default. Use `--print json` when the caller needs the standard `{ ok, data, extra }` envelope and structured binding diagnostics.

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

## Process binding (experimental)

Process binding attaches an existing catalog workspace to an observable OS process scope. It is useful for repeated calls from a long-lived caller when no project workspace file is appropriate. It does not identify a logical Agent/session and it does not grant permission: callers that converge on the same anchor share the binding, while token, permission, and approval behavior still come from the selected workspace.

Prefer a project file when work belongs to one directory. In an unverified process topology, binding may decline to select a workspace rather than guess; use explicit `--workspace <name>` when a caller must proceed independently.

### Bind and confirm

Run bind and confirm as separate CLI processes from the intended long-lived scope:

```text
siyuan-cli current bind dev
  → prints nonce, confirm command, cancel command, and expiry
siyuan-cli current confirm <nonce>
  → binds dev to the nearest reliably identified common process
siyuan-cli current which
  → source: process-binding
```

The nonce has a fixed 15-minute lifetime. A retryable confirm failure preserves the pending record and reports `canRetry: true`, the exact `retryCommand`, and the exact `cancelCommand`. Retrying does not extend the original expiry. When `canRetry` is false, start a new bind instead of retrying the old nonce.

Bind and confirm must be different CLI processes. In an Agent harness, make them separate tool calls—not two commands in one shell block. A disposable wrapper can become the nearest common anchor, so its binding correctly becomes stale when that wrapper exits. The process that launches both calls should have the lifetime you want the binding to have.

### Cancel or release

If confirmation is no longer wanted, use the exact command printed by bind:

```bash
siyuan-cli current cancel <nonce>
```

`cancel` removes only that pending nonce, performs no process observation, and does not change confirmed bindings.

After successful confirmation, release the binding before ending the task:

```bash
siyuan-cli current unbind
```

`unbind` removes only confirmed bindings matching the current process scope. It does not remove pending confirmations. A binding also becomes stale after its anchor exits, but explicit unbind is the normal cleanup path.

### Implicit resolution and uncertainty

`current which` is the no-network way to inspect the effective result. A project workspace and process binding may coexist only when they select the same workspace; otherwise resolution fails with `CURRENT_SELECTION_CONFLICT`.

When no confirmed record exists, implicit selection does not perform process observation. When a confirmed record remains but the current caller cannot reliably match or rule it out, workspace-aware commands fail before a SiYuan request and report `requestSent: false`. Use explicit `--workspace <name>` for that call instead of editing binding files to force fallback.

## Windows shell note

MSYS path conversion and process observation are separate concerns:

- MSYS can rewrite arguments beginning with `/`; use `MSYS_NO_PATHCONV=1` or the `//path` form described in `cli-overview.md`.
- Git Bash and standalone MSYS2 are handled by process-table capability, not product name. When available ancestry cannot establish whether retained binding state applies, the command fails before networking and recommends explicit `--workspace`.

## Selection errors

| Code | Meaning | Next action |
|---|---|---|
| `CURRENT_SELECTION_CONFLICT` | Project and process binding select different workspaces. | Use explicit `--workspace` for one call, or fix the project/binding. |
| `PROCESS_BINDING_NONCE_INVALID` | The nonce syntax is invalid. | Copy the exact nonce printed by bind. |
| `PROCESS_BINDING_PENDING_NOT_FOUND` / `PROCESS_BINDING_PENDING_EXPIRED` | The pending confirmation cannot be used. | Start `current bind <name>` again. |
| `PROCESS_BINDING_SAME_CALL` | Bind and confirm ran in one process. | Confirm in a separate caller invocation. |
| `PROCESS_BINDING_NO_COMMON_ANCESTOR` | Complete observations prove that the calls share no usable scope. | Run both calls from the intended long-lived caller, or use a project file / `--workspace`. |
| `PROCESS_BINDING_OBSERVATION_INSUFFICIENT` | Observation ended before binding applicability could be established. | Follow `retryCommand` when present; otherwise use explicit `--workspace`. |
| `PROCESS_BINDING_OBSERVATION_FAILED` / `PROCESS_TREE_UNAVAILABLE` | The platform query failed or returned unusable data. | Retry; if it persists, use a project file or explicit `--workspace`. |
| `PROCESS_BINDING_STATE_UNAVAILABLE` / `PROCESS_BINDING_PERSISTENCE_FAILED` | Existing state cannot be read or safely updated. | Restore access and follow the error's state/recovery details; do not assume state was removed. |
| `PROCESS_TREE_UNSUPPORTED` | The platform has no available ancestry implementation. | Use a project file or explicit `--workspace`. |
| `VERIFY_MODE_CONFLICT` | A selection verification command received a named-connection mode. | Use `current verify` without a name, or `workspace verify <name|--all>`. |

## Related commands and docs

- `siyuan-cli workspace list` — list catalog entries.
- `siyuan-cli workspace verify <name|--all>` — verify named catalog connections.
- `siyuan-cli current which` — inspect selection without network access.
- `cli-overview.md` — common CLI flags, output channels, and general errors.
- `workspace-config.md` — global config, project file, token, behavior, and permission configuration.
- `recipes/connect-workspace.md` — first connection and selection setup.

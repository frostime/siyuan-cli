---
title: Workspace
summary: Establish a SiYuan connection and prove the next command will use the intended workspace.
---

# Goal

Make this task's commands reach the workspace the user intends, and be able to show that they will.

Two different questions live here. Keep them apart:

```text
management   which workspaces exist, and does one work?      workspace add|list|show|verify|remove
connection   where will my next command actually go?         --workspace | project file | binding | global
```

Management operates on the catalog and ignores the current directory. Connection resolves per call and is directory-sensitive. A wrong answer to the second sends reads and writes to another SiYuan instance, so confirm it before content work.

# Stop and ask when

- no workspace is configured and the base URL, workspace directory, or token is unknown;
- the resolved workspace is not the one the user meant;
- a write would land in a workspace the user never named;
- SiYuan is not running and a local directory cannot be verified.

Never silently switch workspaces for a write. Do not search unrelated files for tokens.

# 1. Inspect what resolves now

```bash
siyuan-cli current which          # no network; reports workspace + source
siyuan-cli workspace list         # catalog entries
```

`current which` reports `source`, so it distinguishes the reason a workspace won:

| `source` | Means |
|---|---|
| `flag` / `env` | `--workspace` or `$SIYUAN_CLI_WORKSPACE` |
| `project-file` | a `.siyuan-cli.yaml` above the cwd |
| `process-binding` | a confirmed binding for this caller |
| `global-current` | machine-wide fallback; the weakest source |

It cannot preview another command's `--workspace` flag, and it does not print resolved permission rules.

# 2. Add a connection if the catalog has none

Known URL and token:

```bash
siyuan-cli workspace add main --url http://127.0.0.1:6806 --token <token>
siyuan-cli workspace verify main
```

Local workspace whose port is unknown — the CLI reads it from workspace metadata:

```bash
siyuan-cli workspace add dev --workspace-dir /path/to/SiYuanDevSpace --token <token>
siyuan-cli workspace verify dev
```

`workspace add` only registers a connection. It does not select it.

# 3. Choose the narrowest scope that covers the work

| Situation | Use | Note |
|---|---|---|
| One or a few calls | `--workspace <name>` on each business command | Wins over project file and binding; no agreement check |
| Repeated work in one project | `workspace: <name>` in `.siyuan-cli.yaml` | Committable; rejects tokens and URLs by design |
| Long-lived caller, no suitable project file | process binding | Experimental → `cli-usage/process-binding.md` |
| Deliberately change the machine default | `siyuan-cli current global <name>` | Shared state, not isolation |

Resolution order for a business call:

```text
--baseUrl → --workspace → $SIYUAN_CLI_WORKSPACE
  → project file / process binding
  → config.current
```

`--baseUrl` is ad-hoc: it bypasses named selection, project discovery, binding, and permission overlays.

A project file and a binding may coexist **only if they name the same workspace**. Disagreement fails with `CURRENT_SELECTION_CONFLICT`, and neither wins by default: pass `--workspace` for one call, or reconcile them.

If resolution falls back to `global-current` and the user never named that target, ask before writing. The CLI also warns with `IMPLICIT_WORKSPACE` on write-like operations in that case.

# 4. Verify, then smoke-test

```bash
siyuan-cli current verify                    # effective selection for this call; takes no name
siyuan-cli workspace verify <name|--all>     # named catalog entries
```

Using the wrong one of these fails with `VERIFY_MODE_CONFLICT`. Then confirm real access with a read before any write:

```bash
siyuan-cli api notebook.lsNotebooks
```

# Success checks

- `current which` names the intended workspace and an explicit `source`, or the business command carries the intended `--workspace`;
- `verify` succeeds and the base URL or workspace directory matches expectations;
- a read-only call returns real data.

# Recovery

| Symptom | Action |
|---|---|
| Verification fails | Confirm SiYuan is running and the target workspace is open; recheck URL/token; for `--workspace-dir`, recheck the path |
| Auth rejected | Ask the user for the current token; `tokenSource: env` resolves at call time, so the variable must be set in the calling shell |
| Wrong workspace resolved | Read `source` from `current which`, then fix the winning layer — do not add a competing one |
| Multiple agents on one machine | Prefer a project file per checkout over `current global`, which is shared |

Configuration fields, token sources, behavior, and merge precedence → `cli-usage/workspace-config.md`.

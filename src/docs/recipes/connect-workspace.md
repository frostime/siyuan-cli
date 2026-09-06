---
title: Connect workspace
summary: Configure, verify, and anchor a SiYuan workspace before running content operations.
---

# Goal

Set up a usable workspace, verify connectivity, and confirm which workspace the current directory resolves to.

# When to use

Use this when:

- the CLI has no configured workspace
- you start in a new machine/session/project
- a command fails with network/auth/config errors
- before any write operation when workspace identity is uncertain

# Required inputs

| Input | Meaning | If unknown |
|-------|---------|------------|
| workspace name | local CLI alias such as `main` or `dev` | choose a descriptive alias |
| base URL | SiYuan kernel URL, usually `http://127.0.0.1:<port>` | ask user or use local workspace auto-discovery |
| token | SiYuan API token | ask user; do not guess or scan unrelated files |
| workspace directory | local SiYuan workspace path for auto-discovery | ask user if port is unknown |

# Stop conditions

Stop and ask the user when:

- no workspace is configured and token/base URL are unknown
- the resolved workspace is not the one the user intended
- SiYuan is not running and local auto-discovery cannot verify a kernel
- a write would target the wrong workspace

Do not silently switch to another configured workspace for writes.

# Default flow

## 1. Inspect current configuration

```bash
siyuan-cli workspace list
siyuan-cli current which
```

`current which` shows the effective workspace after resolving env/project-file/process-binding/global precedence. An explicit `--workspace <name>` on a business command overrides this chain; a project file and process binding that both select a workspace must agree.

## 2. Add a URL-based workspace

Use this when the kernel URL and token are known.

```bash
siyuan-cli workspace add main --url http://127.0.0.1:6806 --token <token>
siyuan-cli workspace verify main
siyuan-cli current which
```

## 3. Add a local workspace by directory

Use this when the local workspace path is known but the kernel port is not.

```bash
siyuan-cli workspace add devspace --workspace-dir /path/to/SiYuanDevSpace --token <token>
siyuan-cli workspace verify devspace
siyuan-cli current which
```

The CLI resolves the runtime base URL from local workspace metadata when possible.

## 4. Anchor a project to a workspace

For project-local agents, prefer `.siyuan-cli.yaml` so concurrent sessions do not race on the machine-global `current global` setting.

```yaml
schemaVersion: 1
workspace: main
```

Then confirm:

```bash
siyuan-cli current which
```

# First smoke tests

After verification, run a read-only command before any write.

```bash
siyuan-cli api notebook.lsNotebooks
siyuan-cli tool list-doc-tree --entry <notebook-id> --depth 1
```

If these fail, fix connection/auth/workspace resolution before continuing.

# Success checks

- `workspace verify <name>` succeeds
- `current which` shows the intended workspace source and name
- a read-only command can list notebooks or a bounded tree
- the resolved base URL matches the expected kernel

# Recovery

## Verification failed

- confirm SiYuan is running
- confirm the base URL and token
- if using `workspace-dir`, confirm the workspace path and that the target workspace is started
- retry with `siyuan-cli workspace verify <name>`

## Auth failed

- ask the user for the current token
- do not search unrelated local files for tokens
- update the workspace config through documented commands/config only

## Wrong workspace selected

- inspect precedence with `siyuan-cli current which`
- check whether `.siyuan-cli.yaml` overrides the current directory
- set the intended workspace explicitly with `--workspace <name>` for one command, or fix the project/global config

## Multiple agents share the machine

- avoid relying on the machine-global `siyuan-cli current global` for project work
- commit `.siyuan-cli.yaml` only when it contains safe fields (`schemaVersion`, `workspace`, permission overrides)
- never store token/baseUrl in `.siyuan-cli.yaml`

# Related docs

- `README.md`
- `cli-usage/cli-overview.md`
- `cli-usage/workspace-config.md`
- `cli-usage/permission.md`

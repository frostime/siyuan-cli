---
title: Connect workspace
summary: Configure, verify, and anchor a SiYuan workspace before running content operations.
---

# Goal

Set up a usable workspace, verify connectivity, and confirm which workspace the current directory resolves to.

# When to use

Use this when the CLI is not configured yet, when you start in a new environment, or before any write operation.

# Inputs

- workspace name
- SiYuan base URL
- optional token or token source

# Steps

1. List current workspaces.
2. Add a workspace if needed.
3. Verify connectivity.
4. Check effective resolution in the current directory.

# Commands

```bash
siyuan workspace list
siyuan workspace add main --url http://127.0.0.1:6806 --token <token>
siyuan workspace verify main
siyuan workspace which
```

For a local workspace where the port is unknown (e.g. second workspace in multi-workspace setup), use directory auto-discovery:

```bash
siyuan workspace add devspace --workspace-dir /path/to/SiYuanDevSpace --token <token>
siyuan workspace verify devspace
```

# Success checks

- `workspace verify` returns `ok: true`
- `workspace which` shows the intended workspace
- the resolved base URL matches the expected kernel

# Recovery

## Verification failed

- confirm SiYuan kernel is running
- confirm the base URL and token
- retry with `siyuan workspace verify <name>`

## Wrong workspace selected

- run `siyuan workspace use <name>`
- check whether `.siyuan-cli.yaml` overrides the current directory

# Related docs

- `README.md`
- `cli-usage/cli-overview.md`
- `cli-usage/config-and-permission.md`

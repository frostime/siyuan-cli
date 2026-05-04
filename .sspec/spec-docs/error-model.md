---
name: error-model
description: "Error model architecture: exit code semantics, error-to-exit mapping across modules, agent-side error handling contract, and framework warning catalog."
updated: 2026-05-04
scope:
  - /src/shared/errors.ts
  - /src/shared/permission.ts
  - /src/workspace/config.ts
  - /src/workspace/project-config.ts
  - /src/workspace/resolve.ts
  - /src/workspace/resolver.ts
  - /src/api/guard.ts
  - /src/api/command.ts
  - /src/approval/errors.ts
deprecated: false
replacement: ""
---

# Error Model

## Overview

All CLI errors are written to stderr as a single-line JSON object before exit. stdout remains clean — agents can redirect stdout on error and still get structured info from stderr.

```json
{"error":"ENDPOINT_DENIED","message":"...","hint":"..."}
```

- `error`: machine-readable code (stable, agent-facing)
- `message`: human-readable
- `hint`: optional recovery suggestion

---

## Exit code semantics

```text
0  OK           success
1  GENERAL      anything not covered below
2  CONFIG       workspace/config/project-file issues
3  NETWORK      connection failures
4  AUTH         token/401 rejection
5  PERMISSION   policy denial (endpoint, tool, content)
```

Source: `src/shared/errors.ts::ExitCode`.

**Design choice**: five coarse categories, not per-error codes. Reason: exit codes are a process-level signal with only 8 bits of resolution. Fine-grained distinction lives in the `error` JSON field, which agents can parse.

---

## Error-to-exit mapping

### Exit 1 — GENERAL

General failures. The `error` field distinguishes subcategories.

| Code | Source module | Cause |
|---|---|---|
| `ERROR` | `errors.ts` | Fallback wrap of unknown throws |
| `KERNEL_ERROR` | `client.ts` | Kernel returned `code != 0` |
| `INVALID_JSON` | `argv.ts` | `-j` or `-f` payload unparseable |
| `PAYLOAD_INVALID` | `argv.ts` | ajv validation failed |
| `STDIN_CONFLICT` | `argv.ts` | `@stdin` used twice in one invocation |
| `STDIN_IS_TTY` | `argv.ts` | `@stdin` with no pipe (terminal) |
| `ENV_NOT_SET` | `argv.ts` | `@env:VAR` where VAR is unset |
| `FILE_READ_ERROR` | `argv.ts` | `@file:path` or `-f path` unreadable |
| `BLOCK_NOT_FOUND` | `permission.ts` | Block id not found in kernel SQL |
| `APPROVAL_UNAVAILABLE` | `permission.ts` | Approval required but no workspace resolved (needed to spawn broker) |
| `APPROVAL_REJECTED` | `approval/errors.ts` | Human rejected in Approval Center |
| `APPROVAL_TIMEOUT` | `approval/errors.ts` | No decision within timeout window |
| `APPROVAL_CANCELLED` | `approval/errors.ts` | Broker shut down while CLI was waiting |
| `APPROVAL_BROKER_UNAVAILABLE` | `approval/errors.ts` | Broker process not running or unreachable |
| `ENDPOINT_NOT_FOUND` | `api/command.ts` | Unknown endpoint id |
| `TOOL_NOT_FOUND` | `tool/command.ts` | Unknown tool id |

### Exit 2 — CONFIG

| Code | Source module | Cause |
|---|---|---|
| `CONFIG_PARSE_ERROR` | `config.ts` | Global config YAML parse failure |
| `CONFIG_VERSION_UNSUPPORTED` | `config.ts` | Global config schemaVersion mismatch |
| `NO_WORKSPACE` | `config.ts` | No active workspace anywhere in the chain |
| `WORKSPACE_NOT_FOUND` | `config.ts` | `--workspace <n>` not in config.workspaces |
| `WORKSPACE_EXISTS` | `commands/workspace.ts` | Add with duplicate name, no `--force` |
| `TOKEN_MODE_CONFLICT` | `commands/workspace.ts` | Multiple token sources specified |
| `WORKSPACE_MISSING_CONNECTION` | `resolve.ts` | Workspace has neither baseUrl nor workspaceDir |
| `WORKSPACE_NOT_FOUND_IN_KERNEL` | `resolver.ts` | workspaceDir not in running kernel's workspace list |
| `WORKSPACE_CLOSED` | `resolver.ts` | Workspace closed in SiYuan |
| `CONF_JSON_UNREADABLE` | `resolver.ts` | conf.json missing or corrupt |
| `PORT_NOT_FOUND` | `resolver.ts` | No localhost address in serverAddrs |
| `WORKSPACE_VERIFY_FAILED` | `resolver.ts` | Port doesn't match workspace at runtime |
| `PROJECT_CONFIG_PARSE_ERROR` | `project-config.ts` | `.siyuan-cli.yaml` unreadable or invalid YAML |
| `PROJECT_CONFIG_VERSION_UNSUPPORTED` | `project-config.ts` | Project file schemaVersion != current |
| `PROJECT_CONFIG_REJECTED_FIELD` | `project-config.ts` | Project file contains `token`/`baseUrl`/`tokenSource`/`defaults` |
| `PROJECT_CONFIG_WORKSPACE_NOT_FOUND` | `project-config.ts` | Project file `workspace:` not in global config |

### Exit 3 — NETWORK

| Code | Source module | Cause |
|---|---|---|
| `ECONNREFUSED` | `client.ts` | Kernel unreachable |
| `ETIMEDOUT` | `client.ts` | Request timed out |
| `SIYUAN_NOT_RUNNING` | `resolver.ts` | Seed port unreachable |
| `VERIFY_FAILED` | `commands/workspace.ts` | Ping failed during `verify`/`add` |

### Exit 4 — AUTH

| Code | Source module | Cause |
|---|---|---|
| `UNAUTHORIZED` | `client.ts` | 401 from kernel |

### Exit 5 — PERMISSION

| Code | Source module | Cause |
|---|---|---|
| `ENDPOINT_DENIED` | `permission.ts` | Pure-caller deny rule or default deny |
| `CONTENT_DENIED` | `permission.ts` / `guard.ts` | Resource-qualified deny rule or default deny |

---

## Agent-side error handling contract

This is the behavioral contract for agent harnesses consuming siyuan-cli output:

| Exit + error | Agent behavior |
|---|---|
| exit 0 | Use stdout as result |
| exit 2 / 3 / 4 | Environment issue — surface to user |
| exit 5 | Permission policy — surface `message` + `hint` |
| exit 1 + `APPROVAL_REJECTED` | Human rejected — surface the decision |
| exit 1 + `APPROVAL_TIMEOUT` | No decision in time — re-run |
| exit 1 + `APPROVAL_CANCELLED` | Broker died mid-wait — re-run |
| exit 1 + `APPROVAL_UNAVAILABLE` | Broker unavailable — inspect state |
| exit 1 + `PAYLOAD_INVALID` | Fix input and retry |
| exit 1 + `KERNEL_ERROR` | Data-level problem — show message as-is |
| exit 1 + other | Generic failure — show message |

---

## Framework warnings (non-fatal)

Warnings go to stderr as JSON but do not affect exit code. Agents should parse them but not treat them as failures.

| Warning | Source | When |
|---|---|---|
| `CONTENT_FILTERED` | `guard.ts` | Response guard removed items (permission filtered) |
| `IMPLICIT_WORKSPACE` | `guard.ts` | Write-like endpoint resolved via `global-current` fallback |
| `YES_BYPASSED` | `guard.ts` | `--yes` passed but `behavior.allowYes` is false (notice, not warning) |
| `LIKELY_HPATH_NOT_ID` | `config.ts` / `project-config.ts` | `notebook` or `root_id` rule value doesn't match kernel id pattern |
| `LIKELY_HPATH_NOT_ID_IN_PATH` | `config.ts` / `project-config.ts` | `path` rule value contains no id segment |
| `LIKELY_PATH_MISSING_SY_SUFFIX` | `project-config.ts` | Path rule has leaf id but missing `.sy` suffix |
| `ROOT_ID_OVERRIDES_PATH` | `project-config.ts` | Both `root_id` and `path` set; `root_id` takes precedence |
| `UNKNOWN_PROJECT_CONFIG_KEY` | `project-config.ts` | Top-level key in `.siyuan-cli.yaml` not recognized |
| `UNKNOWN_PROJECT_BEHAVIOR_KEY` | `project-config.ts` | Key in project `behavior` block not recognized |
| `UNKNOWN_BEHAVIOR_KEY` | `config.ts` | Key in global/workspace `behavior` block not recognized |
| `CONFIG_MIGRATED` | `config.ts` | Legacy `%APPDATA%` config migrated to XDG location |

---

## Key files

| File | Role |
|---|---|
| `src/shared/errors.ts` | `ExitCode`, `CliError`, `fatalError`, `toCliError` |
| `src/shared/permission.ts` | `ENDPOINT_DENIED`, `CONTENT_DENIED`, `BLOCK_NOT_FOUND` |
| `src/workspace/config.ts` | Config parse/version/workspace errors |
| `src/workspace/project-config.ts` | Project config validation errors + smoke warnings |
| `src/workspace/resolver.ts` | Port discovery / workspaceDir resolution errors |
| `src/api/guard.ts` | `APPROVAL_UNAVAILABLE`, `CONTENT_FILTERED`, `IMPLICIT_WORKSPACE` |
| `src/approval/errors.ts` | `APPROVAL_REJECTED`, `APPROVAL_TIMEOUT`, `APPROVAL_CANCELLED` |

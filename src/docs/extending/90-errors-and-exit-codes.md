---
title: Errors and Exit Codes
slug: errors-and-exit-codes
summary: CliError shape, ExitCode map, and how to produce and handle errors consistently.
---

# Errors and Exit Codes

GATE: read when throwing from a new endpoint, tool, or guard; or when an agent needs to react to errors by category.

## Exit code map

```text
0  OK           success
1  GENERAL      anything not covered below (kernel error, parse error, unknown)
2  CONFIG       missing workspace, invalid config file, bad schema version
3  NETWORK      ECONNREFUSED, ETIMEDOUT, fetch abort
4  AUTH         401 from kernel, token rejected
5  PERMISSION   endpoint/tool/content/workspace scope denied
```

Source: `src/utils/errors.ts::ExitCode`.

## Error envelope on stderr

Every error is written to stderr as a single-line JSON object before exit:

```json
{"error":"WORKSPACE_NOT_FOUND","message":"Workspace \"foo\" not found in config.","hint":"Run `siyuan workspace list` to see available workspaces."}
```

- `error`: machine-readable code (stable, agent-facing)
- `message`: human-readable
- `hint`: optional suggestion for recovery (may be absent)

stdout remains clean — an agent can `>/dev/null` stdout on error and still get structured info from stderr.

## Full error code catalog (current)

| Code | Exit | Source | Typical cause |
|---|---|---|---|
| `ERROR` | 1 | fallback wrap | unwrapped throw |
| `KERNEL_ERROR` | 1 | client.ts | kernel returned `code != 0` |
| `INVALID_JSON` | 1 | argv.ts | `-j` or `-f` payload unparseable |
| `PAYLOAD_INVALID` | 1 | argv.ts | ajv validation failed |
| `STDIN_CONFLICT` | 1 | argv.ts | `@stdin` used twice |
| `STDIN_IS_TTY` | 1 | argv.ts | `@stdin` with no pipe |
| `ENV_NOT_SET` | 1 | argv.ts | `@env:VAR` where VAR is unset |
| `FILE_READ_ERROR` | 1 | argv.ts | `@file:path` or `-f path` unreadable |
| `CONFIG_PARSE_ERROR` | 2 | config.ts | YAML parse failure |
| `CONFIG_VERSION_UNSUPPORTED` | 2 | config.ts | schemaVersion mismatch |
| `NO_WORKSPACE` | 2 | config.ts | no active workspace, none passed |
| `WORKSPACE_NOT_FOUND` | 2 | config.ts | `--workspace <n>` not in config |
| `WORKSPACE_EXISTS` | 2 | commands/workspace.ts | add with duplicate name, no `--force` |
| `TOKEN_MODE_CONFLICT` | 2 | commands/workspace.ts | multiple token sources specified |
| `VERIFY_FAILED` | 3 | commands/workspace.ts | ping failed during `verify` / `add` |
| `ECONNREFUSED` | 3 | client.ts | kernel unreachable |
| `ETIMEDOUT` | 3 | client.ts | request timed out |
| `UNAUTHORIZED` | 4 | client.ts | 401 from kernel |
| `ENDPOINT_DISABLED` | 5 | permission.ts | endpoint id denied by policy |
| `TOOL_DISABLED` | 5 | permission.ts | tool id denied by policy |
| `CONTENT_ACCESS_DENIED` | 5 | permission.ts / guard.ts | content scope violation |
| `WORKSPACE_ACCESS_DENIED` | 5 | permission.ts | filesystem scope violation |
| `BLOCK_NOT_FOUND` | 1 | permission.ts | id did not resolve in kernel |
| `CONFIRMATION_REQUIRED` | 1 | guard.ts | write-like without `--yes` |
| `ENDPOINT_NOT_FOUND` | 1 | commands/api.ts | `describe` / call unknown id |
| `TOOL_NOT_FOUND` | 1 | commands/tool.ts | unknown tool id |
| `PROJECT_CONFIG_PARSE_ERROR` | 2 | utils/project-config.ts | `.siyuan-cli.yaml` unreadable or invalid YAML |
| `PROJECT_CONFIG_VERSION_UNSUPPORTED` | 2 | utils/project-config.ts | project file `schemaVersion` != current |
| `PROJECT_CONFIG_REJECTED_FIELD` | 2 | utils/project-config.ts | project file contains `token` / `baseUrl` / `tokenSource` / `defaults` |
| `PROJECT_CONFIG_WORKSPACE_NOT_FOUND` | 2 | utils/project-config.ts | project file `workspace:` name not in global config |

## Throwing errors in your code

### From a guard

```ts
import { ContentAccessDeniedError } from "../core/permission.js";

throw new ContentAccessDeniedError(`payload path "id" must resolve to a block id, got ${typeof v}`);
```

### From a tool or command

```ts
import { CliError, ExitCode } from "../utils/errors.js";

throw new CliError(
  ExitCode.GENERAL,
  "MY_CATEGORY",           // pick a stable short code
  "The thing went wrong.",
  "Run `siyuan ...` to fix it.",  // optional hint
);
```

### Plain throw

`toCliError()` wraps any unknown throw, detecting network errors from Node `ErrnoException.code`. Prefer `CliError` when you know the category — the generic wrap loses `hint` and a stable code.

## Emitting warnings (non-fatal)

Warnings go to stderr but don't affect exit code:

```ts
// in a tool
return {
  content: "...",
  warnings: ["skipped 3 rows with unparseable 'created' field"],
};
```

Rendered as:

```text
[warn] skipped 3 rows with unparseable 'created' field
```

Framework-emitted warnings use a JSON shape:

```json
{"warning":"CONTENT_FILTERED","removed":2,"reasons":"2x: path /denied in read deny list"}
```

Other framework warnings agents should be aware of:

| Warning | Where | When |
|---|---|---|
| `CONTENT_FILTERED` | guard.ts | response guard removed items |
| `IMPLICIT_WORKSPACE` | guard.ts | write-like endpoint resolved workspace via `global-current` fallback |
| `LIKELY_HPATH_NOT_ID` | config.ts / utils/project-config.ts | notebook-rule entry doesn't match kernel id pattern |
| `LIKELY_HPATH_NOT_ID_IN_PATH` | config.ts / utils/project-config.ts | path-rule entry contains no kernel id segment |
| `UNKNOWN_PROJECT_CONFIG_KEY` | utils/project-config.ts | top-level key in `.siyuan-cli.yaml` not recognized |
| `CONFIG_MIGRATED` | config.ts | legacy `%APPDATA%` config migrated to XDG location |

All go to stderr and never change exit code. Agents can parse them line-by-line as JSON.

## Agent-side error handling pattern

```text
exit 0          → use stdout as result
exit 2 / 3 / 4  → environment issue, surface to user ("check workspace / kernel / token")
exit 5          → scope issue, surface reason and hint (user's config explicitly restricts this)
exit 1 + error: CONFIRMATION_REQUIRED  → re-invoke with --yes (if policy permits)
exit 1 + error: PAYLOAD_INVALID        → fix input and retry
exit 1 + error: KERNEL_ERROR           → likely a data-level problem, show message as-is
exit 1 other    → generic failure, show message
```

## Debugging surfaces

- `--debug` on any `siyuan api <id>` or `siyuan tool <id>` prints the intended request (curl form) to stderr before it fires.
- Warnings from guards (`CONTENT_FILTERED`) always go to stderr, even with `--debug` off.
- `siyuan workspace verify --all` probes every workspace's baseUrl/token.
- `siyuan api describe <id>` shows the resolved schema (including guard shape, minus function bodies).

## One-line summary

**Exit code is the category, `error` field is the subcategory, `message` is human, `hint` is recovery. Stable codes; don't invent new codes without adding them here.**

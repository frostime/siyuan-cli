---
name: error-model
description: "Process-level error contract for structured stderr output, exit categories, agent handling, and framework warnings."
updated: 2026-08-10
scope:
  - /src/shared/errors.ts
  - /src/shared/permission.ts
  - /src/workspace/**
  - /src/api/guard.ts
  - /src/api/command.ts
  - /src/tool/**
  - /src/approval/errors.ts
deprecated: false
replacement: ""
---

# Error Model

## Process contract

A failed CLI invocation writes one structured JSON object to stderr and exits non-zero. Normal results stay on stdout.

```json
{"error":"ENDPOINT_DENIED","message":"...","hint":"..."}
```

`error` is the machine-readable category, `message` is human-readable, `hint` is optional recovery guidance, and `details` carries structured context when the caller needs it. `CliError` in `src/shared/errors.ts` is the construction boundary; callers must not infer meaning from the human message.

Approval and warning events may also be emitted as JSON lines on stderr during an otherwise valid invocation. They do not replace the final result or final error.

## Exit categories

| Code | Category | Agent interpretation |
|---:|---|---|
| `0` | OK | Consume stdout. |
| `1` | GENERAL | The command or Kernel operation failed; inspect `error`. |
| `2` | CONFIG | Workspace, project-file, or local configuration must be corrected. |
| `3` | NETWORK | The target or verification request could not be reached. |
| `4` | AUTH | The Kernel rejected authentication. |
| `5` | PERMISSION | Policy denied the endpoint, tool, or resource. |

Exit codes are intentionally coarse. Stable distinctions belong in `error` and `details`, not in additional process exit codes.

## Stable code families

The complete set of codes is owned by their source call sites; this document records the cross-module families and recovery semantics rather than duplicating every literal.

| Family | Representative codes | Recovery meaning |
|---|---|---|
| Input and transport | `INVALID_JSON`, `PAYLOAD_INVALID`, `STDIN_CONFLICT`, `STDIN_IS_TTY`, `ENV_NOT_SET`, `FILE_READ_ERROR` | Fix invocation input before retrying. |
| Workspace/config | `NO_WORKSPACE`, `WORKSPACE_NOT_FOUND`, `WORKSPACE_MISSING_CONNECTION`, `CONF_JSON_UNREADABLE`, `PORT_NOT_FOUND`, `WORKSPACE_VERIFY_FAILED`, `PROJECT_CONFIG_*`, `TOKEN_MODE_CONFLICT`, `VERIFY_MODE_CONFLICT`, `CURRENT_SELECTION_CONFLICT` | Correct local configuration or make the target explicit. |
| Process binding | `PROCESS_TREE_UNSUPPORTED`, `PROCESS_TREE_UNAVAILABLE`, `PROCESS_BINDING_PENDING_NOT_FOUND`, `PROCESS_BINDING_PENDING_EXPIRED`, `PROCESS_BINDING_SAME_CALL`, `PROCESS_BINDING_NO_COMMON_ANCESTOR`, `PROCESS_BINDING_ANCHOR_UNIDENTIFIABLE` | Use the two-step binding flow again, or use a project file / explicit `--workspace` when the process scope cannot be identified. |
| Endpoint/compatibility | `ENDPOINT_NOT_FOUND`, `UNSUPPORTED_KERNEL_VERSION`, `KERNEL_VERSION_UNRECOGNIZED`, `RAW_API_*` | Use a registered/allowed endpoint or a compatible Kernel. |
| Permission | `ENDPOINT_DENIED`, `CONTENT_DENIED`, `BLOCK_NOT_FOUND` | Follow the configured policy or choose an allowed target. |
| Approval | `APPROVAL_UNAVAILABLE`, `APPROVAL_BROKER_UNAVAILABLE`, `APPROVAL_REJECTED`, `APPROVAL_TIMEOUT`, `APPROVAL_CANCELLED` | Inspect the broker, retry, or surface the human decision. |
| Workflow | `TOOL_NOT_FOUND`, `TOOL_MISSING_CLASSIFICATION`, `DOC_NOT_FOUND`, `DOC_AMBIGUOUS`, `SKILL_TARGET_INVALID`, `SKILL_TARGET_MISSING`, `CHECKPOINT_*` | Correct the selected workflow target or preserve the reported partial result. |

When adding a new user-visible code, assign it to the appropriate exit category, preserve the JSON shape, and update tests at the owning module. Do not make this document a second source of truth for a code's exact message.

## Agent handling rules

| Result | Required handling |
|---|---|
| exit `0` | Use stdout as the command result; parse stderr events only when relevant. |
| exit `2`, `3`, or `4` | Surface the environment/configuration problem and its hint. |
| exit `5` | Surface the permission reason and hint; do not silently retry. |
| exit `1` + `APPROVAL_REJECTED` | Surface that a human rejected the request. |
| exit `1` + `APPROVAL_TIMEOUT` | Retry only when the operation is still safe and intended. |
| exit `1` + `APPROVAL_CANCELLED` | Treat the approval flow as interrupted; do not assume the Kernel write happened. |
| exit `1` + `CHECKPOINT_PARTIAL_FAILURE` | Preserve the successful layer reported in `details`; inspect before retrying. |
| exit `1` + `PAYLOAD_INVALID` | Fix the payload; retrying unchanged input is not useful. |
| exit `1` + `KERNEL_ERROR` | Surface the Kernel message as a data-level failure. |

## Framework warnings

Warnings and notices are JSON objects on stderr and do not change the exit code.

- `CONTENT_FILTERED`: response items were removed by permission filtering.
- `IMPLICIT_WORKSPACE`: a write-like or high-severity operation used `config.current` without an explicit target.
- `YES_BYPASSED`: `--yes` was supplied while the configured behavior does not allow it.
- `LIKELY_HPATH_NOT_ID`, `LIKELY_HPATH_NOT_ID_IN_PATH`, `LIKELY_PATH_MISSING_SY_SUFFIX`: a permission value looks inconsistent with ID-based path semantics.
- `UNKNOWN_PROJECT_CONFIG_KEY`, `UNKNOWN_PROJECT_BEHAVIOR_KEY`, `UNKNOWN_BEHAVIOR_KEY`: a config key is ignored for forward compatibility.
- `CONFIG_MIGRATED`: a legacy config location was migrated; this is a notice, not a failure.

`ROOT_ID_OVERRIDES_PATH` is not currently emitted; normalization still gives `root_id` precedence. Documentation must not present that disabled diagnostic as an active warning.

## Change constraints

Keep the following stable for agent callers:

- errors are machine-readable JSON on stderr;
- stdout is not contaminated by failure output;
- exit categories retain their current meaning;
- `details` contains recovery-relevant state for partial operations and approval flows;
- a new code does not silently reuse a misleading existing category.

Source authority: `src/shared/errors.ts` and the `CliError` call site in the owning module. Permission-specific semantics are defined in `permission-model.md`; approval lifecycle errors are defined in `src/approval/approval-broker.SPEC.md`.

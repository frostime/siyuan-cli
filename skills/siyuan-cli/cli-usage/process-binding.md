---
title: Process binding
slug: process-binding
summary: Experimental workspace selection tied to a long-lived caller process, with its two-call protocol and cleanup rules.
---

# Process binding (experimental)

Read this only after choosing binding in `recipes/workspace.md`. A project file or explicit `--workspace` is preferable whenever either fits.

Binding attaches a catalog workspace to an **observable OS process scope** — normally the long-lived shell or harness process that launches each CLI call. Consequences:

- it does not identify a logical Agent or session; separate sessions sharing one host process share one binding;
- it grants no authority: token, permission, and approval still come from the selected workspace;
- it lives exactly as long as the anchor process.

Use it for repeated calls from one long-lived caller when no project file is appropriate. Prefer a project file whenever the work belongs to a directory.

# Bind and confirm are two separate calls

```bash
siyuan-cli current bind <name>       # prints nonce, confirm command, cancel command, expiry
siyuan-cli current confirm <nonce>   # separate invocation; establishes the binding
siyuan-cli current which             # expect source: process-binding
```

Run them as **two independent tool calls**, never two commands in one shell block. The binding anchors to the nearest process common to both calls, so a disposable wrapper that runs both becomes the anchor and the binding dies with it. The process whose lifetime you want the binding to have must be the one issuing both calls.

Use the exact `confirmCommand` and nonce the CLI printed; do not construct one.

The pending nonce lasts 15 minutes from `bind`. A retryable failure keeps it and reports `canRetry: true` with an exact `retryCommand` — **retrying does not extend the original expiry**. When `canRetry` is false, start a new `bind`.

# Cancel versus unbind

These act on different state and are not interchangeable:

```bash
siyuan-cli current cancel <nonce>    # pending only; drops that one confirmation
siyuan-cli current unbind            # confirmed only; drops this scope's binding
```

Abandoning a bind before confirming → `cancel`. Finishing a task that bound successfully → `unbind`. A binding also goes stale once its anchor exits, but explicit `unbind` is the normal cleanup path, and leaving one behind can force an unrelated later caller to fail.

# When binding cannot decide

If a confirmed binding exists but this caller can neither be matched to it nor ruled out of it, the command fails **before** contacting SiYuan and reports `requestSent: false`.

That refusal is deliberate: guessing could send a write to the wrong workspace. Pass explicit `--workspace <name>` for that call. Do not delete or edit binding state files to force a fallback — unreadable state is unknown, not absent.

# Failure fields to act on

Binding errors carry `hint`, `bindingExists`, `canRetry`, `retryCommand`, `cancelCommand`, and `requestSent`. Act on those fields rather than matching error codes. Two cases are worth stating outright:

- a project file and a binding naming different workspaces fail with `CURRENT_SELECTION_CONFLICT`, and neither wins by default;
- `requestSent: false` means the target request never left the CLI, so no partial write occurred.

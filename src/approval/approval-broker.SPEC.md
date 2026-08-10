---
name: approval-broker
summary: Maintenance contract for the local approval broker and its CLI/browser protocol.
updated: 2026-08-10
scope:
  - /src/approval/**
---

# Approval Broker Specification

## Boundary

The approval broker is a separate, local-only Node.js process. It mediates human decisions for endpoint calls whose permission effect is `approval`; it does not decide whether approval is required. That policy belongs to `src/api/guard.ts` and `src/shared/permission.ts`.

The broker binds to `127.0.0.1` on a dynamically selected port and is started lazily by the CLI. It is **not a daemon**: it may exit after the queue has been idle.

## Observable protocol

The broker exposes HTTP on `http://127.0.0.1:<port>`.

| Route | Access | Contract |
|---|---|---|
| `GET /approval?token=<token>` | token in query | Serve the browser approval UI. |
| `GET /api/approval/status` | local broker access | Return running state, pid, port, pending count, and waiter count. |
| `GET /api/approval/requests` | local broker access | Return pending requests and up to 20 recent requests. |
| `GET /api/approval/requests/:id` | local broker access | Return one request or `APPROVAL_NOT_FOUND`. |
| `GET /api/approval/requests/:id/wait` | local broker access | Long-poll until a decision or timeout. |
| `POST /api/approval/requests` | `x-siyuan-approval-token` | Create a pending request. |
| `POST /api/approval/requests/:id/approve\|reject\|cancel` | token header | Record a decision and wake all waiters. |
| `POST /api/approval/shutdown` | token header | Cancel pending requests and stop the broker. |

All endpoints are local-only because the server binds to loopback. Mutating routes still require the broker token. The browser URL carries the token so the UI can authenticate itself.

The request state machine is:

```text
pending → approved | rejected | cancelled | timed_out
```

A decision records an actor (`human-browser`, `human-cli`, or `caller`), timestamp, and optional note. A request that has already reached a terminal state is not decided again.

## Client timing contract

The request timeout is part of the request (`timeoutSec`, default 60 seconds). The CLI sends the broker a wait timeout of:

```text
timeoutSec × 1000 + 1000ms
```

The extra second is required: the CLI fetch timeout must not fire before the broker returns its own `APPROVAL_WAIT_TIMEOUT` response. Multiple waiters for one request are supported.

The CLI emits an `APPROVAL_PENDING` JSON event to stderr after creating a request. Normal command results remain on stdout.

## Process lifecycle and race prevention

- The CLI first checks the state files and pings `/api/approval/status`.
- Concurrent callers serialize startup through an exclusive startup lock.
- A stale startup lock older than 15 seconds may be removed.
- The broker is spawned detached with ignored stdio and an unref'ed child process.
- The broker waits up to 5 seconds to become reachable after spawn.
- When there are no pending requests and no waiters, a 30-second grace timer starts.
- A hard idle timeout of 5 minutes is also enforced.
- New work or a new waiter resets the idle lifecycle.
- Shutdown cancels every pending request as `cancelled` with actor `caller`, wakes waiters, removes broker state files, and exits successfully.

The CLI client submits `autoOpen: false` and controls browser opening itself. It is controlled by `behavior.approval.autoOpen` and debounced through a persisted last-open timestamp so separate CLI processes do not repeatedly open the browser. Direct broker clients may request `autoOpen: true`, in which case the broker opens the UI when the first pending request is created. A failed browser launch is a warning, not an approval failure; the approval URL remains usable manually.

## Authentication and state

Each broker spawn creates a fresh random token. It is passed to the child through `SIYUAN_APPROVAL_BROKER_TOKEN` and written to the approval runtime state with restrictive permissions where the platform supports them.

The runtime state directory contains broker pid/port/token files, a startup lock, request JSON files, and date-partitioned JSONL audit files. State-file cleanup on stale detection or shutdown does **not** remove request history or audit records. Do not introduce cleanup that silently destroys those records without an explicit policy decision.

Audit records include the request id, terminal status, actor, endpoint id, workspace name, payload digest, summary, and optional decision note. The payload digest supports correlation without treating the audit file as a second payload store.

## Change constraints

When changing this module:

- keep the broker loopback-only unless the authentication and threat model are redesigned;
- preserve token checks on every mutating route;
- preserve terminal request decisions and waiter notification;
- keep the client/broker timeout buffer synchronized;
- keep approval state and audit persistence semantics explicit;
- keep broker startup race-safe and independently terminable;
- route user-visible approval failures through the typed errors in `src/approval/errors.ts`.

For the permission decision that leads to this broker, read `/.dev/docs/permission-model.md`. For the CLI-facing error contract, read `/.dev/docs/error-model.md`.

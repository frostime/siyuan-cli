---
name: approval-broker
description: "Approval broker architecture: lazy-spawn process model, token IPC, state file layout, lifecycle policy, HTTP API, and browser UI."
updated: 2026-05-01
scope:
  - /src/approval/broker.ts
  - /src/approval/runtime.ts
  - /src/approval/client.ts
  - /src/approval/store.ts
  - /src/approval/broker-paths.ts
  - /src/approval/broker-browser.ts
  - /src/approval/ui.ts
  - /src/approval/approval-center.html
  - /src/approval/types.ts
  - /src/approval/errors.ts
deprecated: false
replacement: ""
---

# Approval Broker

## Overview

The approval broker is a **separate Node.js process** that acts as an HTTP intermediary between the CLI caller and a human reviewer. When an endpoint requires approval via permission rule, the CLI spawns the broker on demand, submits a request, and long-polls for a decision. The human reviews and decides via a browser UI served by the broker itself.

The broker is **not a daemon** — it exits automatically when idle.

---

## Architecture

```
CLI invocation (guard.ts)
  │
  ├─ ensureBroker()          # check if broker is running; spawn if not
  │    └─ spawnApprovalBroker()  # detached child process, stdio: ignore
  │
  ├─ POST /api/approval/requests   # submit request
  │
  ├─ openApprovalBrowser()         # open browser to /approval?token=...
  │
  └─ GET /api/approval/requests/:id/wait   # long-poll until decision
       │
       └─ [human decides in browser]
            └─ POST /api/approval/requests/:id/approve|reject|cancel
```

The broker process is the CLI binary re-invoked with `approval broker` subcommand. It binds to `127.0.0.1` on a random port (`:0`), writes its PID/port/token to state files, then serves requests.

---

## Process lifecycle

### Spawn

`spawnApprovalBroker()` in `src/approval/runtime.ts`:

- Resolves the CLI entry point from `process.argv[1]` (or `SIYUAN_APPROVAL_CLI_ENTRY` env var).
- Spawns `node <cli-entry> approval broker --port 0` with `detached: true`, `stdio: ignore`.
- Calls `child.unref()` so the parent process can exit without waiting.
- Passes `SIYUAN_APPROVAL_BROKER_TOKEN` (randomly generated) and `SIYUAN_APPROVAL_CLI_ENTRY` in the child's env.

### Startup lock

Multiple CLI invocations may race to spawn the broker. A file lock (`broker-start.lock`) prevents duplicate spawns:

1. Caller checks if broker is already running (`getRunningBroker()`).
2. If not, acquires `broker-start.lock` via `openSync(path, 'wx')` (exclusive create).
3. Re-checks after acquiring the lock (another process may have won the race).
4. Spawns if still not running; releases lock when done.
5. Stale locks (older than `BROKER_START_LOCK_STALE_MS = 15s`) are cleaned up automatically.

### Auto-exit policy

The broker exits when idle. Two timers run in parallel:

| Timer | Condition | Delay | Action |
|-------|-----------|-------|--------|
| Grace timer | `pendingCount == 0 && waiterCount == 0` | `QUEUE_EMPTY_GRACE_MS = 30s` | shutdown |
| Hard idle | same condition + `lastWorkAt` age | `HARD_IDLE_TIMEOUT_MS = 5min` | shutdown |

The grace timer is reset whenever a new request arrives or a waiter connects. On shutdown, all pending requests are cancelled (decision: `cancelled`, actor: `caller`), state files are cleaned up, and the process exits with code 0.

`SIGINT` and `SIGTERM` both trigger the same graceful shutdown path.

---

## Token authentication

The broker token is a 24-byte random value (`randomBytes(24).toString('base64url')`), generated fresh on each spawn. It is:

- Passed to the broker process via `SIYUAN_APPROVAL_BROKER_TOKEN` env var.
- Written to `broker-token.txt` (mode `0600`) by the broker on startup.
- Read by CLI clients from `broker-token.txt` to authenticate requests.
- Included in the browser UI URL as a query parameter (`?token=...`).

All mutating HTTP endpoints require the token in the `x-siyuan-approval-token` header. The browser UI URL embeds the token so the human reviewer is automatically authenticated.

---

## State file layout

All state lives under `~/.config/siyuan-cli/runtime/approval/`:

```
runtime/approval/
├── broker.pid          # broker process PID (integer)
├── broker-port.txt     # broker HTTP port (integer)
├── broker-token.txt    # broker auth token (base64url string)
├── broker-start.lock   # startup mutex (exclusive file lock)
├── requests/
│   └── apr_<id>.json   # one file per ApprovalRequest (pending or decided)
└── audit/
    └── YYYY-MM-DD.jsonl  # append-only audit log, one JSON line per decision
```

All files under `runtime/approval/` are mode `0600` on POSIX (best-effort; Windows ignores).

Stale state (broker.pid points to a dead process) is cleaned up automatically on the next `getRunningBroker()` call via `cleanupStaleApprovalBrokerState()`.

---

## HTTP API

The broker exposes a minimal REST API on `http://127.0.0.1:<port>`. All endpoints except `GET /approval` and `GET /api/approval/status` require the `x-siyuan-approval-token` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/approval?token=<t>` | query param | Browser UI (HTML) |
| `GET` | `/api/approval/status` | none | Broker health + counts |
| `GET` | `/api/approval/requests` | none | List pending + recent requests |
| `POST` | `/api/approval/requests` | header | Submit new request |
| `GET` | `/api/approval/requests/:id` | none | Read single request |
| `GET` | `/api/approval/requests/:id/wait?timeoutMs=N` | none | Long-poll for decision |
| `POST` | `/api/approval/requests/:id/approve` | header | Approve |
| `POST` | `/api/approval/requests/:id/reject` | header | Reject |
| `POST` | `/api/approval/requests/:id/cancel` | header | Cancel |
| `POST` | `/api/approval/shutdown` | header | Graceful shutdown |

### Long-poll semantics

`GET /api/approval/requests/:id/wait` holds the connection open until a decision arrives or `timeoutMs` elapses. The CLI caller uses `timeoutMs = timeoutSec * 1000 + 1000` (1s buffer) as the client-side fetch timeout. The broker receives the raw `timeoutMs` query parameter for its long-poll wait. The 1s buffer ensures the client fetch does not abort before the broker's own timeout fires. On timeout, the broker returns HTTP 504 with `{ error: "APPROVAL_WAIT_TIMEOUT" }`, and the client throws `ApprovalTimeoutError`.

Multiple waiters for the same request are supported (multiple CLI processes can wait on the same request ID).

---

## Request lifecycle

```
created (pending)
  ├─ approved  → actor: human-browser | human-cli
  ├─ rejected  → actor: human-browser | human-cli
  ├─ cancelled → actor: caller (broker shutdown or explicit cancel)
  └─ timed_out → actor: caller (expiresAt elapsed, detected by 500ms poll)
```

`ApprovalRequest` is persisted to `requests/<id>.json` at each state transition. Decided requests remain on disk after the broker exits.

<!-- TODO: ISSUE — broker shutdown only cleans up state files (pid/port/token) via `cleanupApprovalBrokerState()`. Request files in `requests/` and audit logs in `audit/` are NOT removed. `removeApprovalStateDir()` exists in broker-paths.ts but is never called from broker.ts. Decide: either call it on shutdown, or accept accumulation and remove this note. -->

Audit records are appended to `audit/YYYY-MM-DD.jsonl` on every decision (approved, rejected, cancelled, timed_out). The audit log survives broker restarts — it is not cleaned up on shutdown.

---

## Browser UI

The browser UI is an HTML page loaded from `src/approval/approval-center.html` by `src/approval/ui.ts` (which injects the auth token) and served directly by the broker's HTTP server at `GET /approval?token=<t>`. It is a self-contained single-page app (no external dependencies) that:

- Polls `GET /api/approval/requests` to list pending requests.
- Displays payload preview, resource summary, severity, and expiry countdown.
- Posts to `/api/approval/requests/:id/approve|reject` with the token embedded in the request body.

The browser is opened automatically via `openApprovalBrowser()` in `src/approval/broker-browser.ts` when the first pending request is created (`autoOpen: true` by default, configurable via `behavior.approval.autoOpen`).

---

## CLI client flow (`src/approval/client.ts`)

```
ensureBroker()
  → getRunningBroker()          # check state files + ping /api/approval/status
  → [if not running] acquireBrokerStartLock() → spawnApprovalBroker() → waitForApprovalBroker()

requestAndWait(preparedRequest)
  → POST /api/approval/requests  (autoOpen: false — client handles browser open)
  → openApprovalBrowser(url)
  → emit APPROVAL_PENDING to stderr
  → GET /api/approval/requests/:id/wait
  → [decision arrives]
    → approved  → return decision
    → rejected  → throw ApprovalRejectedError
    → timed_out → throw ApprovalTimeoutError
    → cancelled → throw ApprovalCancelledError
```

`APPROVAL_PENDING` is written to stderr as a JSON line so agent harnesses can detect and surface the approval URL without parsing stdout.

---

## Key constants (`src/approval/runtime.ts`)

| Constant | Value | Meaning |
|----------|-------|---------|
| `DEFAULT_REQUEST_TIMEOUT_SEC` | 60 | Default approval timeout (overridable via `behavior.approval.timeout`) |
| `QUEUE_EMPTY_GRACE_MS` | 30 000 | Grace period before auto-exit when queue is empty |
| `HARD_IDLE_TIMEOUT_MS` | 300 000 | Hard idle timeout (5 min) |
| `BROKER_READY_TIMEOUT_MS` | 5 000 | Max wait for broker to become ready after spawn |
| `BROKER_START_LOCK_STALE_MS` | 15 000 | Age at which startup lock is considered stale |

---

## Key files

| File | Role |
|------|------|
| `src/approval/broker.ts` | HTTP server, request routing, waiter management, lifecycle timers |
| `src/approval/runtime.ts` | Spawn, startup lock, ping, stale cleanup, policy constants |
| `src/approval/client.ts` | `ensureBroker`, `requestAndWait`, `buildPreparedApprovalRequest` |
| `src/approval/store.ts` | Request persistence (JSON files), audit log (JSONL) |
| `src/approval/broker-paths.ts` | All filesystem path helpers; pure utilities, no process logic |
| `src/approval/broker-browser.ts` | Cross-platform browser open |
| `src/approval/ui.ts` | Browser UI template loader (reads `approval-center.html`, injects token) |
| `src/approval/approval-center.html` | Browser UI HTML/JS source |
| `src/approval/types.ts` | All approval-related TypeScript types |
| `src/approval/errors.ts` | `ApprovalRejectedError`, `ApprovalTimeoutError`, `ApprovalCancelledError`, `ApprovalBrokerUnavailableError` |

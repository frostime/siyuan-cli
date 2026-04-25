---
change: "confirm-human-approval-channel"
created: 2026-04-26T00:34:51
---

# Design: confirm-human-approval-channel

## 1. User-visible outcome

A confirm-gated write should feel like this:

```text
agent / human runs `siyuan ...`
  -> CLI discovers confirm gate
  -> Approval Center opens automatically in browser
  -> terminal waits inline for up to 60s
  -> human clicks Approve / Reject
  -> same CLI process resumes with the original prepared payload
```

When several approvals are pending, the user sees one shared Approval Center queue:

```text
Pending approvals
1. Delete 3 blocks      00:42
2. Move doc to archive  00:55
3. Update attrs         00:58
```

## 2. Structural blueprint

### Module boundary

Approval is treated as one cohesive feature module.

```text
src/
├── approval/
│   ├── index.ts        # public entrypoints for the rest of the CLI
│   ├── types.ts        # request / decision / event / config types
│   ├── errors.ts       # approval-specific CliError subclasses
│   ├── runtime.ts      # state dir, pid/port discovery, broker lifecycle helpers
│   ├── client.ts       # CLI -> broker HTTP client, ensureBroker(), requestAndWait()
│   ├── store.ts        # file-backed request store + audit log
│   ├── broker.ts       # localhost HTTP server and request coordinator
│   ├── ui.ts           # built-in Approval Center HTML + small browser JS
│   └── command.ts      # `siyuan approval ...` command group
├── core/
│   └── guard.ts        # single integration seam: hand off confirm to approval module
├── cli.ts              # register approval command
└── docs/               # document approval flow
```

### Integration rule

```text
All approval behavior lives in `src/approval/`.
External files may only:
- call `approval.requestAndWait(...)`
- register `approvalCommand`
- document the feature
```

This keeps approval logic out of `core/permission.ts`, `core/tools.ts`, and command handlers.

## 3. Interface contract

### Types exposed by `src/approval/index.ts`

```ts
export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'timed_out'
  | 'cancelled';

export interface PreparedApprovalRequest {
  workspaceName: string;
  endpointId: string;
  endpointPath: string;
  callerTool?: string;
  risk: 'confirm' | 'elevated' | 'destructive' | 'critical';
  summary: string;
  payloadPreview: unknown;
  payloadDigest: string;
  resourceSummary: string[];
  timeoutSec: number;
}

export interface ApprovalRequest extends PreparedApprovalRequest {
  id: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
  decision?: ApprovalDecision;
}

export interface ApprovalDecision {
  status: 'approved' | 'rejected' | 'timed_out' | 'cancelled';
  decidedAt: string;
  actor: 'human-browser' | 'human-cli' | 'caller';
  note?: string;
}

export interface ApprovalPendingEvent {
  event: 'APPROVAL_PENDING';
  requestId: string;
  url: string;
  summary: string;
  expiresAt: string;
}

export interface ApprovalClientOptions {
  cwd?: string;
  autoOpen?: boolean;
}

export interface ApprovalModule {
  requestAndWait(
    request: PreparedApprovalRequest,
    opts?: ApprovalClientOptions
  ): Promise<ApprovalDecision>;
  ensureBroker(opts?: ApprovalClientOptions): Promise<{ baseUrl: string }>;
}
```

### Guard seam

`src/core/guard.ts` owns one approval call site:

```ts
if (wouldConfirm && !yes) {
  await approval.requestAndWait(preparedRequest);
}
```

After `approved`, `executeEndpoint()` continues its existing execution path.

## 4. Behavioral flow

### Single request sequence

Example command:

```bash
siyuan api block.deleteBlock --id 202604260001
```

Sequence:

```text
1. CLI parses args and builds payload
2. executeEndpoint() computes `wouldConfirm = true`
3. guard.ts builds PreparedApprovalRequest
4. guard.ts calls approval.requestAndWait(request)
5. approval/client.ts ensures broker is running
6. approval/client.ts POSTs request to broker
7. approval/broker.ts stores request and auto-opens Approval Center
8. approval/client.ts writes APPROVAL_PENDING to stderr
9. approval/client.ts waits for decision with one long-poll request
10. browser user clicks Approve
11. approval/broker.ts marks request approved and resolves the waiter
12. guard.ts resumes and performs the real SiYuan write
```

### Data ownership

| Owner | Holds | Why |
|---|---|---|
| CLI process | full payload, token, execution context | only the original command should execute the real write |
| Approval Broker | request summary, preview, digest, status, audit | only approval state and UI coordination live here |
| Browser UI | transient view state | human interaction only |

### Safety invariant

```text
human approves request digest D
CLI executes only if current prepared payload still hashes to D
```

## 5. Transport design

### CLI -> Broker

Localhost HTTP JSON.

```http
POST /api/approval/requests
Content-Type: application/json
```

Request body:

```json
{
  "workspaceName": "main",
  "endpointId": "block.deleteBlock",
  "endpointPath": "/api/block/deleteBlock",
  "summary": "Delete 1 block",
  "risk": "destructive",
  "payloadPreview": { "id": "202604260001" },
  "payloadDigest": "sha256:8f6c...",
  "resourceSummary": ["block: 202604260001"],
  "timeoutSec": 60
}
```

Response:

```json
{
  "requestId": "apr_01HXYZ",
  "status": "pending",
  "url": "http://127.0.0.1:4312/approval",
  "expiresAt": "2026-04-26T01:01:00Z"
}
```

### CLI waiting

Use one long-poll request per pending approval.

```http
GET /api/approval/requests/apr_01HXYZ/wait?timeoutMs=61000
```

Broker behavior:

```text
- keep connection open while request is pending
- return immediately on approved / rejected / timed_out / cancelled
- return final decision payload exactly once
```

CLI behavior:

```text
- no short-interval polling loop
- one waiting request per original command
```

### Browser -> Broker

MVP browser behavior:

```text
- poll `GET /api/approval/requests` every 1s
- fetch `GET /api/approval/requests/:id` for detail view
- send `POST /approve` or `POST /reject` for decisions
```

This keeps the implementation small. The API shape stays compatible with future SSE.

## 6. Broker runtime

### Lifecycle

```text
first confirm-gated request
  -> ensureBroker()
  -> clean stale pid / port state if needed
  -> broker starts lazily
  -> broker listens on 127.0.0.1:<port>
  -> broker writes pid + port state
```

```text
while pending requests > 0
  -> stay alive

when pending requests == 0 and waiters == 0
  -> start 30s grace timer
  -> if a new request arrives, cancel the grace timer
  -> if grace timer elapses, shutdown broker
```

```text
hard protection
  -> if broker stays idle for 5 min, shutdown broker
```

### Borrowed daemon patterns from `simple-lsp-cli`

```text
- lazy start on first demand
- Windows: localhost TCP + port file
- pid file for discovery
- stale-state cleanup
- idle auto-exit
```

### Broker-local state layout

```text
<state-dir>/approval/
  broker.pid
  broker-port.txt
  requests/
    apr_01HXYZ.json
  audit/
    2026-04-26.jsonl
```

## 7. Store behavior

### Request file shape

```json
{
  "id": "apr_01HXYZ",
  "status": "pending",
  "createdAt": "2026-04-26T01:00:00Z",
  "expiresAt": "2026-04-26T01:01:00Z",
  "workspaceName": "main",
  "endpointId": "block.deleteBlock",
  "summary": "Delete 1 block",
  "risk": "destructive",
  "payloadPreview": { "id": "202604260001" },
  "payloadDigest": "sha256:8f6c...",
  "resourceSummary": ["block: 202604260001"]
}
```

### State machine

```text
pending
  -> approved
  -> rejected
  -> timed_out
  -> cancelled
```

### Timeout ownership

The broker owns timeout transitions.

```text
now >= expiresAt && status == pending
  -> status = timed_out
  -> persist request
  -> append audit record
  -> resolve any waiter
```

## 8. Approval Center contract

### UI layout

```text
+-----------------------------------------------------------+
| Approval Center                                  auto-open |
+---------------------------+-------------------------------+
| Pending (N)               | Request detail                |
|                           |                               |
| 1. Delete 3 blocks  00:42 | Summary: Delete 3 blocks ... |
| 2. Move doc         00:55 | Risk: destructive            |
| 3. Update attrs     00:58 | Workspace: main              |
|                           | Endpoint: block.deleteBlock  |
|                           | Resources:                   |
|                           | - block: 202604260001        |
|                           | Preview:                     |
|                           | { ... }                      |
|                           |                               |
|                           | [Approve] [Reject]           |
+---------------------------+-------------------------------+
```

### UX rules

| Rule | Behavior |
|---|---|
| first pending request | auto-open browser |
| later pending requests | reuse same Approval Center |
| timeout | card updates automatically to expired state |
| multiple callers | each caller waits on its own request id |
| browser page left open | browser polling does not extend broker lifetime |

## 9. Command surface

All manual and operational controls stay inside the approval module.

```text
siyuan approval status
siyuan approval list
siyuan approval show <id>
siyuan approval approve <id>
siyuan approval reject <id>
siyuan approval open
siyuan approval stop
```

Role of these commands:
- browser-open fallback
- queue inspection
- manual decision path
- broker lifecycle control

## 10. Error contract

Approval errors are defined in `src/approval/errors.ts` and thrown by `approval/client.ts`.

```ts
APPROVAL_REJECTED
APPROVAL_TIMEOUT
APPROVAL_CANCELLED
APPROVAL_BROKER_UNAVAILABLE
```

Example:

```json
{
  "error": "APPROVAL_TIMEOUT",
  "message": "Approval request \"apr_01HXYZ\" timed out after 60s.",
  "details": {
    "requestId": "apr_01HXYZ",
    "url": "http://127.0.0.1:4312/approval"
  }
}
```

## 11. Interaction with existing flags

| Flag | Behavior |
|---|---|
| `--yes` | bypasses approval flow and executes immediately |
| `--dry-run` | previews only; no approval request is created |
| `--print json` | approval pending event still goes to stderr as structured JSON |
| `--debug` | includes broker base URL and request metadata |

## 12. Execution boundaries

### Files that change because of approval

| Path | Responsibility |
|---|---|
| `src/approval/*` | the feature itself |
| `src/core/guard.ts` | single execution seam |
| `src/cli.ts` | command registration |
| `src/docs/cli-usage/*` | docs |

### Files that stay unchanged in behavior

| Path | Reason |
|---|---|
| `src/core/permission.ts` | permission evaluation still decides `wouldConfirm`; approval execution lives elsewhere |
| `src/core/tools.ts` | tools inherit approval behavior through `executeEndpoint()` |
| `src/commands/api.ts` / `src/commands/tool.ts` | command handlers keep their current role |

## 13. Deliberately reserved for later

```text
- workflow-level batch approval
- SSE instead of browser polling
- remote approval from another machine
- approval reuse cache for identical requests
```

---
change: "json-print-envelope"
created: 2026-05-07T13:40:48
---

# Design: json-print-envelope

## 1. Output Contract

```typescript
export interface JsonPrintEnvelope<T = unknown> {
    ok: true;
    data: T;
    extra: {
        warnings: Array<Record<string, unknown>>;
        notices: Array<Record<string, unknown>>;
        approvals: Array<Record<string, unknown>>;
        debug?: Record<string, unknown>;
        meta?: Record<string, unknown>;
    };
}
```

## 2. Flow

```text
api/tool command
  → parse args
  → execute endpoint/tool
  → collect diagnostics
  → prepare json envelope
  → stdout: one JSON document
  → stderr: fatal errors only
```

## 3. Data Placement

| Source | Current path | New path |
|---|---|---|
| API success payload | `stdout` raw JSON | `envelope.data` |
| Tool success payload | `stdout` raw `details` JSON | `envelope.data` |
| Tool content summary | compact-only text | `envelope.extra.meta` or `extra.notices` |
| Guard warnings | direct stderr JSON | `envelope.extra.warnings` |
| Approval pending / auto-open events | direct stderr JSON | `envelope.extra.approvals` |
| Debug preview | direct stderr JSON | `envelope.extra.debug` |

## 4. Execution Model

```text
executeEndpoint()/renderToolResult()
  ├─ push warning/notice/debug into collector
  ├─ approval/client.ts pushes approval events into collector
  └─ return primary payload

command layer
  ├─ build envelope from payload + collector
  └─ JSON.stringify(envelope) once
```

## 5. Boundary Choice

- Keep fatal failures on the existing `CliError` path.
- Do not change non-JSON commands.
- Do not add a second envelope format for compact mode.
- Do not normalize approval into stdout-only interaction; the browser/broker flow stays intact.

## 6. Migration Shape

1. Introduce a small collector object in the shared output path.
2. Thread it through API guard + approval client + tool render path.
3. Switch json-mode command output to the envelope.
4. Add parseability tests and event-placement tests.


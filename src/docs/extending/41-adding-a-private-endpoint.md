---
title: Adding a Non-Public Kernel Endpoint
slug: adding-a-private-endpoint
summary: How to reverse-engineer an undocumented SiYuan kernel API into a stable EndpointSchema.
---

# Adding a Non-Public Kernel Endpoint

GATE: the endpoint is not in the official kernel API docs, but it's callable (you see it used by the SiYuan UI, a plugin, or community code). This doc is the recovery path.

**Ethical gate first**: if the endpoint is explicitly marked as internal or deprecated by upstream, you take on the maintenance cost. Name the schema file with that in mind; add `minKernelVersion` and a comment in `description` citing the kernel commit/version where you observed the behavior.

## Overall plan

```text
1. Observe the endpoint in the wild    (DevTools / SiYuan source)
2. Pin down the payload shape          (what kernel accepts)
3. Pin down the response shape         (what kernel returns)
4. Classify + guard                    (fit into our framework)
5. Write the schema, verify against a real kernel
6. Document the brittleness            (minKernelVersion, description note)
```

## 1. Observe

### 1a. Browser DevTools against the running SiYuan UI

SiYuan's desktop/web UI is a browser context. Open DevTools → Network, filter by `/api/`, trigger the UI action you want to wrap.

What to capture per request:

- request URL (→ `endpoint`)
- request body JSON (→ `payload`)
- response body JSON (→ shape analysis)
- repeated captures with different inputs (→ field variability)
- response envelope always `{ code: 0, msg: "", data: ... }` — only `data` matters to us

### 1b. SiYuan source code search

SiYuan kernel is Go (`github.com/siyuan-note/siyuan`). Search:

- `ginServer.POST("/api/<group>/<n>"` → route registration
- the handler function name → payload struct and response struct
- the struct field tags `json:"..."` → exact field names to put in `payload.properties`

Handler struct example:

```go
type xxxRequest struct {
    ID       string `json:"id"`
    Paths    []string `json:"paths"`
    Optional *bool  `json:"optional,omitempty"`
}
```

Maps to:

```ts
payload: {
  type: "object",
  required: ["id", "paths"],         // non-pointer, non-omitempty → required
  additionalProperties: false,
  properties: {
    id:       { type: "string", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    paths:    { type: "array", items: { type: "string" } },
    optional: { type: "boolean" },   // pointer + omitempty → optional
  },
},
```

### 1c. Community plugins

SiYuan plugins often exercise the full kernel surface. GitHub search for `fetchSyncPost("/api/<group>/<n>"` reveals real call sites.

## 2. Payload shape

### Required vs optional

From Go source:

| Go shape | JSONSchema mapping |
|---|---|
| `Field string` | `required`, `type: "string"` |
| `Field *string` | optional, `type: "string"` |
| `Field string \`json:",omitempty"\`` | optional (omit from `required`) |
| `Field []string` | `type: "array", items: {type: "string"}` |
| `Field map[string]any` | `type: "object", additionalProperties: true, properties: {}` |
| `Field interface{}` | last resort: `type: "object", additionalProperties: true` |

### Enum fields

If the handler validates against a set of literals, add `enum`:

```ts
dataType: { type: "string", enum: ["markdown", "dom"], default: "markdown" }
```

### ID fields

If the field is a SiYuan block id, always pin the pattern:

```ts
id: { type: "string", pattern: "^\\d{14}-[0-9a-z]{7}$" }
```

catching garbage early beats a kernel 500.

## 3. Response shape

### Strategy

Don't declare `response` on `EndpointSchema` unless you've stabilized the shape — the field is optional and informational. What you **must** pin down is the shape for the **guard**:

- "items are at `data.blocks[*]`" — need for `itemsAt`
- "each item has `id` as `id`, `path` as `path`, `box` as `notebook`" — need for `fieldMap`

### Shape-detection pattern

```sh
node dist/cli.mjs api <id> -j '{"...minimal payload..."}' | jq .
```

Inspect:

- is the root an array or an object?
- if object, where are the permission-relevant entities?
- is there metadata in parallel with the list (totals, nextCursor)?

Write the minimal guard first, add coverage as you learn more.

### Common kernel response patterns

```text
unwrapped data is a flat array of records:
  → itemsAt: "[*]"

unwrapped data is { blocks: [...] }:
  → itemsAt: "blocks[*]"

unwrapped data is { files: [...], box: "id" }:
  → filterResponse (need box for fieldMap fallback; see listDocsByPath)

unwrapped data is a single object:
  → no response guard; payloadTargets covers it
```

## 4. Classify

Apply `11-classification-and-risk.md`. Key questions:

1. does this endpoint persist a change? → `write`; else `read` (or `invoke` for runtime actions like notification/flush)
2. what surface? — if it's asset files on disk, `workspace`; if it's block content, `content`; if it's kernel state only (flush, exit), `runtime`
3. scope? — does it take an id (`single`), a list of ids (`batch`), or nothing specific (`global`)?
4. if `read` + `global`, the registry will **require** a response guard; don't skip

Use `riskOverride` if the derived risk is obviously wrong, with a comment.

## 5. Write & verify

### Workflow

```sh
# Write the schema + register it
edit src/apis/<group>/<n>.ts
edit src/apis/index.ts

# Type and lint
pnpm typecheck
pnpm build

# Real kernel probe
node dist/cli.mjs api <id> --help
node dist/cli.mjs api <id> <minimal inputs>
node dist/cli.mjs api <id> --debug <...>

# Edge cases
node dist/cli.mjs api <id> -j '{}'                 # should reject via ajv
node dist/cli.mjs api <id> -j '{"id":"bad"}'       # should reject via pattern
node dist/cli.mjs api <id> <...> --dry-run         # write-like only
```

### Version guard

If the endpoint was added in a specific kernel version:

```ts
minKernelVersion: "3.1.0",
description: "Exposed by the kernel since 3.1.0. Not part of the public API docs; observed at kernel commit abc123.",
```

## 6. Document the brittleness

Private APIs break. Write description fields assuming a future reader has no context:

- which kernel version you saw it in
- how you inferred the shape (DevTools / source / plugin)
- any known variants or deprecations
- an anchor URL to the kernel source file if stable enough (SiYuan often moves files around)

Example:

```ts
description: [
  "Undocumented; observed in SiYuan UI (kernel/api/doc.go, commit abc123).",
  "Request shape mirrors the Go struct DocLinksRequest.",
  "Response shape as of 3.1.x: { links: [{ id, defID, content, type }] }.",
  "The `type` field is an enum but the kernel does not validate it server-side."
].join("\n"),
```

## Anti-patterns

- **inventing field names that look plausible**: test them, don't guess
- **guarding an id field you're not sure is a block id**: wrong `kind` makes the guard resolve it as a block id and fail with `BLOCK_NOT_FOUND`
- **using `additionalProperties: true` "just in case"**: defeats schema validation; the whole point of schema here is to fail fast
- **skipping `payloadTargets` for non-public ids**: permission model still applies; private endpoints don't get a pass
- **forgetting to add to `src/apis/index.ts`**: file exists, builds fine, endpoint silently absent

## One-line summary

**Observe → type the payload → type the response enough to guard → classify → verify. Private APIs deserve more documentation than public ones, not less.**

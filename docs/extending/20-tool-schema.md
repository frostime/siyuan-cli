---
title: ToolSchema Reference
slug: tool-schema
summary: How to write a high-level tool that composes endpoints and returns a content + details result.
---

# ToolSchema Reference

GATE: build a `tool` when the user value is a **workflow** (multiple endpoints, shaping, formatting), not a single endpoint call. If one endpoint does the job, expose it via `siyuan api` and stop.

## Minimal shape

```ts
import type { ToolSchema } from "../core/schema.js";

export const tool: ToolSchema = {
  id: "resolve-path",
  summary: "Resolve hpath or id to stable SiYuan path",
  tags: ["read", "util"],
  input: {
    type: "object",
    additionalProperties: false,
    properties: {
      hpath: { type: "string", description: "Human-readable hpath" },
      id:    { type: "string", description: "Block or document ID" },
    },
  },
  async run(ctx, input) {
    const { hpath, id } = input as { hpath?: string; id?: string };
    if ((hpath ? 1 : 0) + (id ? 1 : 0) !== 1) {
      throw new Error("Exactly one of --hpath or --id is required.");
    }
    const value = (hpath ?? id)!.replace(/'/g, "''");
    const stmt = hpath
      ? `SELECT id, box, path, hpath FROM blocks WHERE type='d' AND hpath = '${value}'`
      : `SELECT id, box, path, hpath FROM blocks WHERE id = '${value}'`;
    const rows = await ctx.callEndpoint<Array<{ id: string; box: string; path: string; hpath: string }>>(
      "query.sql", { stmt }
    );
    const matches = rows.map((r) => ({ id: r.id, notebook: r.box, path: r.path, hpath: r.hpath }));
    return {
      content: matches.length
        ? `Found ${matches.length} match:\n` + matches.map((m) => `- ${m.path} (hpath=${m.hpath}, id=${m.id})`).join("\n")
        : "No match.",
      details: { matches },
    };
  },
};
```

## Field reference

### `id` (required)

Kebab-case, unique across all tools. Becomes `siyuan tool <id>`.

### `summary` (required)

One-line verb-first description. Shown in `siyuan tool list`.

### `tags` (optional)

From `ToolTag = "read" | "write" | "aggregate" | "util"`. Used by `siyuan tool list --tag <t>`.

### `input` (required)

Same JSONSchema subset as `EndpointSchema.payload`. Validated by the same argv parser — `--json` / `--file` / positional primary / named flags all work. See `13-cli-behavior.md`.

### `output` (optional)

Informational JSONSchema for the `details` part of the result. Not validated at runtime.

### `cli` (optional)

Same shape as `EndpointSchema.cli`. Common settings:

```ts
cli: {
  primary: "markdown",
  allowSource: { markdown: ["literal", "file", "stdin"] },
  examples: [
    { command: "siyuan tool append-content --targetId xxx --targetType dailynote --markdown @stdin" },
  ],
},
```

### `run(ctx, input)` (required)

```ts
run: (ctx: ToolContext, input: unknown) => Promise<ToolResult>
```

## `ToolContext`

```ts
interface ToolContext {
  client:         unknown;      // runtime value is SiyuanClient
  registry:       unknown;      // runtime value is EndpointRegistry
  permission:     PermissionEngineLike;
  callEndpoint:   <T>(id: string, payload: unknown) => Promise<T>;
  callEndpointRaw:<T>(id: string, payload: unknown) => Promise<T>;
  logger:         unknown;      // runtime value is console
  args:           GlobalArgs;   // { workspace, dryRun, yes, debug, details, only, ... }
}
```

The runtime values are concrete (`SiyuanClient`, `EndpointRegistry`, `console`), but the public `ToolContext` type currently keeps these fields broad. Cast only when you truly need the concrete methods.

### `callEndpoint` vs `callEndpointRaw`

| | guards | confirmation | dry-run | debug | use when |
|---|---|---|---|---|---|
| `callEndpoint` | yes | yes | yes | yes | normal case — every call a user could make directly |
| `callEndpointRaw` | **no** | no | no | no | tool's own internal probe (e.g. SQL lookup to resolve an id before the real call) |

Rule of thumb: if the user's `--dry-run` should also dry-run this internal call, use `callEndpoint`. If it's a read that establishes context and should always execute, `callEndpointRaw` is fine — but guards are also bypassed, so think before reaching for it.

## `ToolResult`

```ts
interface ToolResult {
  content: string;                                  // stdout with --print compact (default)
  details?: unknown;                                // structured, shown with --print json
  warnings?: string[];                              // stderr, prefixed with [warn]
  meta?: { elapsedMs?; filteredCount?; truncated? }; // stderr only in --debug
}
```

**Design the content field for humans, the details field for programs.**

- `content`: a single string, usually markdown. Keep short — truncate with "... (N more omitted)" if needed.
- `details`: full structured data. This is what an agent programmatically consumes via `--print json`.
- `warnings`: anomalies that didn't cause failure (skipped rows, unparseable fields, partial results).
- `meta`: timing, counts, flags.

## `args` — respecting global flags

Tools should honor:

- `args.dryRun`: return a preview result instead of doing writes. Example from `append-content`:

  ```ts
  if (ctx.args.dryRun) {
    return {
      content: `dry-run: would append to [${targetType}] ${targetId}`,
      details: { operations: [...] },
    };
  }
  ```

- `args.debug`: can print extra diagnostics via `ctx.logger`.
- `args.print`: handled by the renderer, not the tool.

## Permission enforcement for tools

When a tool is invoked:

1. `createToolContext()` calls `permission.checkTool(id)` → Phase 1 check; rejects if a pure-caller deny rule matches or default is deny
2. Each `ctx.callEndpoint(...)` runs full endpoint guards (Phase 2 content check, confirm gate) with `callerTool` threaded through for rule matching
3. `ctx.callEndpointRaw(...)` skips endpoint guards — use only for internal read probes

The tool itself doesn't need to call `permission.checkContentRef()` directly — delegating to `callEndpoint` is enough.

## Registration

Add to `src/tools/<tool-id>.ts`, then in `src/tools/index.ts`:

```ts
import { tool as myTool } from "./my-tool.js";
const tools = [listDocTree, listDailynote, appendContent, resolvePath, myTool];
```

The array registration happens at import time; order doesn't matter for lookup.

## Help surface

`siyuan tool <id> --help` is built by `buildToolHelp()`:

- summary
- USAGE
- PARAMETERS (same format as endpoint help)
- OUTPUT (explains `--print compact|json`)
- EXAMPLES (if declared)
- DESCRIPTION (if declared)

## Conventions

- one tool per file, kebab-case filename matching the id
- return early with a helpful error message for input that validation didn't catch (mutual exclusion, format)
- SQL escape hand-written: only escape single quote as `''` (SQLite). Do not try `%` / `_` escaping unless the value flows into `LIKE`.
- write user-facing content in the user's language if the repo trends that way; keep code comments / errors in English
- prefer `ctx.callEndpoint("query.sql", { stmt })` for structured reads; it's faster to iterate than authoring a new endpoint schema

## One-line summary

**A tool is `input → run(ctx, input) → {content, details}`. Compose endpoints via `callEndpoint`, use `callEndpointRaw` sparingly.**

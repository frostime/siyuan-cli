---
title: Adding a Tool
slug: adding-a-tool
summary: Walkthrough for writing a composition tool under src/tool/builtins/.
---

# Adding a Tool

GATE: the user-facing action requires **more than one endpoint call**, **formatting**, or **resolution logic**. If one endpoint does the job, just document it as `siyuan api <id>` and stop. See `20-tool-schema.md` for the type reference.

## Checklist

```text
[ ] 1. Define the user value (what problem does this tool solve in one sentence?)
[ ] 2. Sketch input shape
[ ] 3. Sketch output: content (human) + details (program)
[ ] 4. Implement run() using ctx.callEndpoint
[ ] 5. Handle dry-run, warnings, meta
[ ] 6. Register in src/tool/builtins/index.ts
[ ] 7. Verify
```

## Step-by-step example

Goal: `list-backlinks` — given a block id, list all blocks that reference it, with their document context.

### 1. Define the value

"For any block id, return who links to it, with enough context (doc title + snippet) to be useful."

Not expressible by a single endpoint because it needs SQL to find refs + title resolution per distinct document.

### 2. Input

```ts
input: {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id:    { type: "string", description: "Target block id", pattern: "^\\d{14}-[0-9a-z]{7}$" },
    limit: { type: "integer", description: "Max backlinks to return", default: 50 },
  },
},
cli: { primary: "id" },
```

### 3. Output sketch

```text
content:
  # Backlinks to <target>
  - [Doc A] block-id-1 "snippet..."
  - [Doc B] block-id-2 "snippet..."

details:
  {
    target: "20260417...",
    count: 7,
    matches: [
      { id, rootId, hpath, snippet },
      ...
    ],
  }
```

### 4. Implementation

```ts
// src/tool/builtins/list-backlinks.ts
import type { ToolSchema } from "../shared/schema.js";

type RefRow = { id: string; root_id: string; content: string };
type DocRow = { id: string; hpath: string };

export const tool: ToolSchema = {
  id: "list-backlinks",
  summary: "List blocks that reference the target block",
  tags: ["read", "aggregate"],
  input: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id:    { type: "string", description: "Target block id", pattern: "^\\d{14}-[0-9a-z]{7}$" },
      limit: { type: "integer", description: "Max backlinks", default: 50 },
    },
  },
  cli: { primary: "id" },
  async run(ctx, input) {
    const { id, limit = 50 } = input as { id: string; limit?: number };
    const esc = (s: string) => s.replace(/'/g, "''");

    // 1. refs table → referring blocks
    const refs = await ctx.callEndpoint<RefRow[]>("query.sql", {
      stmt: `SELECT B.id, B.root_id, B.content
             FROM refs AS R
             JOIN blocks AS B ON R.block_id = B.id
             WHERE R.def_block_id = '${esc(id)}'
             ORDER BY B.updated DESC
             LIMIT ${Math.min(Math.max(limit, 1), 500)}`,
    });

    if (refs.length === 0) {
      return { content: "No backlinks found.", details: { target: id, count: 0, matches: [] } };
    }

    // 2. resolve distinct doc titles for display
    const rootIds = [...new Set(refs.map((r) => r.root_id))];
    const quoted = rootIds.map((r) => `'${esc(r)}'`).join(", ");
    const docs = await ctx.callEndpoint<DocRow[]>("query.sql", {
      stmt: `SELECT id, hpath FROM blocks WHERE type='d' AND id IN (${quoted})`,
    });
    const titleOf = new Map(docs.map((d) => [d.id, d.hpath]));

    // 3. shape the result
    const matches = refs.map((r) => ({
      id: r.id,
      rootId: r.root_id,
      hpath: titleOf.get(r.root_id) ?? "<unknown>",
      snippet: r.content.length > 80 ? r.content.slice(0, 80) + "..." : r.content,
    }));

    const lines = matches.map((m) => `- [${m.hpath}] ${m.id} "${m.snippet}"`);
    return {
      content: `# Backlinks to ${id} (${matches.length})\n` + lines.join("\n"),
      details: { target: id, count: matches.length, matches },
      meta: { filteredCount: matches.length },
    };
  },
};
```

### 5. dry-run / warnings / meta

- `args.dryRun`: this tool is read-only, skip dry-run handling
- warnings: if some `rootId` couldn't be resolved (rare but possible), emit a `warnings: ["skipped N rows with unresolved doc title"]`
- meta: `filteredCount` lets `--debug` show counts without polluting stdout

For a write-capable tool, always honor `args.dryRun`:

```ts
if (ctx.args.dryRun) {
  return {
    content: `dry-run: would call block.updateBlock for ${id}`,
    details: { operations: [{ endpoint: "block.updateBlock", payload }] },
  };
}
```

### 6. Register

```ts
// src/tool/builtins/index.ts
import { tool as listBacklinks } from "./list-backlinks.js";

const tools = [listDocTree, listDailynote, appendContent, resolvePath, listBacklinks];
```

### 7. Verify

```sh
pnpm typecheck
pnpm build
node dist/cli.mjs tool list
node dist/cli.mjs tool list-backlinks --help
node dist/cli.mjs tool list-backlinks <some-block-id>
node dist/cli.mjs tool list-backlinks <some-block-id> --print compact
node dist/cli.mjs tool list-backlinks <some-block-id> --print json | jq .
```

## Design heuristics

### When to split into multiple tools

If the same core data can be presented "by doc", "by date", "as tree", and "flat", a single tool with a `mode` flag is worse than 2–3 small tools — each easier to document, easier for an agent to select.

### When to use `callEndpointRaw`

Only for internal lookups where you would otherwise re-enter the guard pipeline in a way that hurts UX — e.g. the tool already validated the scope, and the follow-up SQL is just a resolution step with no new user-visible effect. 90% of the time, use `callEndpoint`.

### Return shape discipline

- `content`: **terse**, human-shaped. Markdown allowed, headings allowed, but assume it may be piped into a chat.
- `details.matches` / `.entries` / `.items`: pick one container name and stick to it.
- Always include the user's original input fields in `details` (target id, date range, etc.) so the caller can correlate.

### Error shape

Throw plain `Error` for input problems. The CLI layer wraps it into `{error: "ERROR", message: "..."}` JSON on stderr and exits 1. For specific categories, wrap your own `CliError` (see `90-errors-and-exit-codes.md`).

## Anti-patterns

- **tool that just forwards one endpoint call**: delete it, use `siyuan api <id>` directly
- **bypassing `callEndpoint` to hit `ctx.client.call` directly**: skips all guards; almost always wrong
- **content > 200 lines**: truncate; put full data in details
- **silent truncation without a meta flag**: set `meta.truncated = true` or add a warning
- **SQL injection via unescaped user input**: always `.replace(/'/g, "''")` for SQLite literals

## One-line summary

**A tool is a workflow, not a proxy. Shape `content` for humans, `details` for programs, honor `--dry-run`, and reuse `callEndpoint` for everything visible to the user.**

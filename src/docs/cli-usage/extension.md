---
title: User Extensions
slug: user-extensions
summary: Write custom API endpoints and workflow tools for siyuan-cli.
---

# User Extensions

## Overview

`siyuan-cli` supports loading user extensions from `~/.config/siyuan-cli/extensions/` at runtime. You can add:

- **API extensions** (`apis/*.ts`) — custom wrappers around SiYuan kernel APIs or other HTTP endpoints.
- **Tool extensions** (`tools/*.ts`) — reusable workflow scripts that compose multiple API calls.

Extensions are written in TypeScript, loaded via `jiti` at execution time, and cached as `*.schema.json` for fast discovery.

## Extension or downstream SKILL?

| You need... | Build... | Why |
|-------------|----------|-----|
| A reusable endpoint contract with schema, classification, guards, help, and formatting | API extension (`apis/*.ts`) | It becomes a CLI endpoint and participates in validation/permission behavior. |
| A reusable multi-call operation that should run as one CLI command | Tool extension (`tools/*.ts`) | It lives in the CLI runtime and is discoverable through `siyuan tool list/describe`. |
| User-specific workflow policy, notebook defaults, templates, naming rules, or review cadence | Downstream Agent SKILL | It is guidance for an agent, not reusable CLI runtime code. |

If the reusable part is **code**, use an extension. If the reusable part is **decisions about when/where/how to use the CLI**, use a downstream Agent SKILL.

**API extension = schema wrapper for one HTTP endpoint.** It declares payload, classification, guard, and format — but does not contain custom multi-step logic. If the operation composes multiple kernel calls or contains runtime orchestration, write a **tool extension** instead.

## Directory Layout

```
~/.config/siyuan-cli/extensions/
├── tsconfig.json       # auto-generated; points to siyuan-cli types
├── .gitignore          # ignores node_modules/ and *.schema.json
├── apis/
│   ├── .gitkeep
│   └── echo.ts         # example API extension
└── tools/
    ├── .gitkeep
    └── hello.ts        # example tool extension
```

## Getting Started

```bash
siyuan extension init               # scaffold the directory
siyuan extension list               # show discovered extensions + cache status
siyuan extension cache              # batch-generate all schema.json files
```

## Authoring Contract

| Kind | Location | Export | Minimum shape |
|------|----------|--------|---------------|
| API extension | `apis/*.ts` or `apis/*.mjs` | `export const schema` | `endpoint`, `summary`, `payload`, `classification` |
| Tool extension | `tools/*.ts` or `tools/*.mjs` | `export const tool` | `id`, `summary`, `input`, `run()` |

Notes:
- Built-in ID/endpoint conflicts are skipped with a warning.
- Discovery reads `*.schema.json` cache files; execution loads the real module.
- `siyuan extension cache` is the fastest way to refresh metadata after edits.

## Cold-start Workflow

```text
1. siyuan extension init
2. create apis/foo.ts or tools/bar.ts
3. siyuan extension cache
4. siyuan extension list
5. siyuan api|tool describe <id>
6. siyuan api|tool <id> ...
```

Use `describe` immediately after `cache` to confirm that the CLI recognized your extension contract before trying to execute it.

## Writing an API Extension

Create `~/.config/siyuan-cli/extensions/apis/echo.ts`:

```ts
import type { EndpointSchema } from "@frostime/siyuan-cli/schema";

export const schema: EndpointSchema = {
  endpoint: "/api/custom/echo",
  summary: "Echo payload",
  payload: {
    type: "object",
    properties: {
      text: { type: "string", description: "Echo text" }
    },
    required: ["text"]
  },
  classification: { mode: "read", surface: "meta", scope: "single" },
  format: ({ payload }) => String((payload as { text: string }).text)
};
```

Run it:

```bash
siyuan api custom.echo --text "hello"
```

### Where is the definition of SiYuan Kernel API

The agent can visit the website (if it is capable), and generate the extension file.

**Reference**

1. [Source Code](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)
   1. All SiYuan API is located under `/kernel/api/*.go`
   2. Most reliable, but needs agent analyse code by it self
   3. Recommend to use `gh` CLI to analyse github code

2. Document provided by community, could be out-dated (missing new endpoint)

   - `https://leolee9086.github.io/siyuan-kernelApi-docs/`, provided by leolee9086
   - `https://leolee9086.github.io/siyuan-kernelApi-docs/index.html`, provided by leolee9086
   - `https://github.com/siyuan-community/siyuan-sdk/tree/main/schemas/kernel/api`, provided by Zuoqiu-Yingyi

## Writing a Tool Extension

Create `~/.config/siyuan-cli/extensions/tools/hello.ts`:

```ts
import type { ToolSchema } from "@frostime/siyuan-cli/schema";

export const tool: ToolSchema = {
  id: "hello-ext",
  summary: "Hello extension",
  input: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name" }
    }
  },
  async run(_ctx, input) {
    const { name = "world" } = input as { name?: string };
    return { content: `Hello, ${name}!` };
  }
};
```

Run it:

```bash
siyuan tool hello-ext --name Alice
```

## Schema Cache

On first execution of an extension, siyuan-cli writes a sidecar `*.schema.json` next to the `.ts` file. This cache is used for:

- `siyuan api list` / `siyuan tool list` — fast discovery without importing `.ts`
- `siyuan api -h` / `siyuan tool -h` — showing command metadata

If you see `[uncached]` in `list` output, run `siyuan extension cache` to populate all caches without executing logic.

The cache is invalidated automatically when the `.ts` file mtime changes.

## TypeScript Configuration

`siyuan extension init` generates a `tsconfig.json` with `paths` pointing to the global siyuan-cli installation. The key entry is:

```json
"@frostime/siyuan-cli/schema": ["<pkg>/shared/schema.d.mts"]
```

This ensures `import type { EndpointSchema, ToolSchema } from "@frostime/siyuan-cli/schema"` resolves correctly in your IDE.

If you prefer a local `node_modules` install instead of `paths`:

```bash
npm install --save-dev @frostime/siyuan-cli
# then remove the paths entries from tsconfig.json
```

## Calling kernel APIs from a Tool

Your Tool's `run` function receives a `ToolContext` (`ctx`) with these helpers:

- `ctx.callEndpoint(id, payload)` — call a registered endpoint (with permission checks, guard logic, and response filtering).
- `ctx.callEndpointRaw(endpoint, payload)` — call any `/api/...` path directly, bypassing registry and guards.
- `ctx.client` — the raw `SiyuanClient` instance for full control.

Use `callEndpoint` when the endpoint is already wrapped by siyuan-cli (built-in or via an API extension):

```ts
async run(ctx, input) {
  const docs = await ctx.callEndpoint('filetree.searchDocs', { k: input.query });
  return { content: `Found ${docs.length} documents` };
}
```

Use `callEndpointRaw` only for one-off internal probes when SiYuan's kernel has an API that siyuan-cli doesn't wrap yet. It returns the unwrapped kernel `data` value and bypasses schema validation, permission checks, approval, response filtering, dry-run, and debug output:

```ts
async run(ctx, input) {
  const assets = await ctx.callEndpointRaw<string[]>('/api/asset/getUnusedAssets', {});
  return { content: `Found ${assets.length} unused assets` };
}
```

For repeated use, or when you need payload schema validation, permission guards, approval behavior, response filtering, compact formatting, or discoverable help, write an API extension instead of continuing to use raw calls.

For workflow policy or user-specific conventions, use a downstream Agent SKILL instead; see "Extension or downstream SKILL?" above.

For the full list of kernel APIs, inspect the upstream source:
https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go

## Package-local reference

`cli-usage/extension.md` is shipped inside the same installed package as the runtime code. Use `siyuan doc list` / `siyuan doc read cli-usage/extension.md` to locate the docs root, then inspect the sibling `dist/` directory in that package when documentation is incomplete.

| File | What it contains |
|------|-----------------|
| `dist/shared/schema.d.mts` | `EndpointSchema`, `ToolSchema`, `ToolContext`, `GlobalArgs` type declarations |
| `dist/shared/client.mjs` | `SiyuanClient` — HTTP client with `call(endpoint, payload)` |
| `dist/api/registry.mjs` | `EndpointRegistry` — endpoint registration and lookup |
| `dist/tool/registry.mjs` | `ToolRegistry`, `createToolContext` — assembles `ToolContext` at runtime |


## Permission schema coupling

Permission behavior is not solely controlled by user config rules. Each endpoint schema declares fields that determine **what the permission engine can enforce**. This section is essential for extension authors.

### `classification` → auto-approval

Every endpoint schema declares a `classification`. This is the **source of truth** for risk-based auto-approval. The classification fields (`mode`, `surface`, `scope`) feed the risk derivation matrix (see `permission.md` §Risk-based auto-approval).

Extension authors cannot disable auto-approval for destructive operations — only the user can, via `--yes` (if `behavior.allowYes` is true).

Example:

```ts
classification: {
  mode: "write",
  surface: "content",
  scope: "batch",       // batch → risk = destructive → auto-approval
  operation: "delete"
}
```

### `guard.payloadTargets` → resource scoping

User rules that use `notebook` or `path` conditions can only match endpoints whose schema declares `guard.payloadTargets`. These tell the CLI which payload fields contain protected resources:

```ts
guard: {
  payloadTargets: [
    { path: "id", kind: "id", access: "read" },
    { path: "ids[*]", kind: "id", access: "write" }
  ]
}
```

- `kind: "id"` → CLI resolves block id to owning document's `notebook` + `path`, enabling notebook/path-scoped rules.
- `kind: "notebook"` → value used directly as notebook id.
- `kind: "path"` → value used directly as id-based document path.

**Without `guard.payloadTargets`**, a user rule like `notebook: "xxx"` cannot match the endpoint — the permission engine has nothing to resolve.

### `guard.response` → response filtering

Global read endpoints (`mode: "read"`, `scope: "global"`) MUST declare a response guard so the CLI can filter out items from disallowed notebooks/paths:

```ts
guard: {
  response: {
    itemsAt: "[*]",
    fieldMap: { id: "id", path: "path", notebook: "box" }
  }
}
```

**`approval` does not apply to response filtering.** The response guard only acts on `deny` — items matched by an `approval` rule are kept. Approval is a pre-execution gate; it has no role after the kernel has responded.

When response filtering removes content, the CLI emits `CONTENT_FILTERED` on stderr (or in `extra.warnings` for `--print json`). Agents should treat filtered results as valid but incomplete.

### Extension author checklist

1. What `classification` fits? Remember `write + batch` triggers auto-approval.
2. Does the payload contain block ids, notebook ids, or paths? → declare `guard.payloadTargets`.
3. Is it a global read? → MUST declare `guard.response` or `guard.filterResponse`.

## Raw API vs registered API: permission boundary

`siyuan api raw <endpoint>` bypasses endpoint schemas entirely:

- no payload schema validation
- no `guard.payloadTargets` → notebook/path-scoped permission cannot be enforced
- no response filtering
- no compact formatter

**Decision guide:**

| Situation | Use |
|-----------|-----|
| One-off probe of unregistered kernel API | `api raw` |
| Repeated use or need for schema/guard/formatting | Write an API extension |
| Need resource-scoped permission control | Write an API extension with `guard.payloadTargets` |

For `api raw` config: see `workspace-config.md` §Raw API fallback.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module '@frostime/siyuan-cli/schema'` | Missing explicit `paths` entry | Regenerate with `siyuan extension init` |
| Extension not showing in `list` | Missing or stale cache | Run `siyuan extension cache` |
| `conflicts with builtin` warning | Extension ID collides with built-in | Rename your extension endpoint/tool id |
| `[uncached]` in `list` output | `.ts` never executed | Run the extension once, or `siyuan extension cache` |

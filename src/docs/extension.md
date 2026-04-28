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

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module '@frostime/siyuan-cli/schema'` | Missing explicit `paths` entry | Regenerate with `siyuan extension init` |
| Extension not showing in `list` | Missing or stale cache | Run `siyuan extension cache` |
| `conflicts with builtin` warning | Extension ID collides with built-in | Rename your extension endpoint/tool id |
| `[uncached]` in `list` output | `.ts` never executed | Run the extension once, or `siyuan extension cache` |

---
title: Architecture Overview
slug: extending-overview
summary: Map of source layout, request lifecycle, and extension points.
---

# Architecture Overview

GATE: read this before touching `src/apis/**`, `src/tools/**`, or `src/core/**`.

## Source map

```text
src/
├── cli.ts               entry, citty command tree + custom help dispatcher
├── apis/                kernel endpoint schemas (one file per endpoint)
│   ├── index.ts         registers every schema into `registry`
│   └── <group>/<name>.ts
├── tools/               high-level tools (one file per tool)
│   ├── index.ts         registers every tool into `toolRegistry`
│   └── <tool-id>.ts
├── commands/            citty subcommand definitions
│   ├── api.ts           `siyuan api ...`
│   ├── tool.ts          `siyuan tool ...`
│   ├── workspace.ts     `siyuan workspace ...`
│   └── skill.ts         `siyuan skill ...`
├── core/                framework
│   ├── schema.ts        all types + PointerPath runtime
│   ├── registry.ts      EndpointRegistry, risk derivation, schema validation
│   ├── tools.ts         ToolRegistry, context builder, result renderer
│   ├── config.ts        config.yaml load/save, workspace resolution, token sources
│   ├── permission.ts    PermissionEngine, scope checks, filterItems
│   ├── guard.ts         applyPayloadGuard, applyResponseGuard, executeEndpoint
│   ├── client.ts        SiyuanClient (HTTP to kernel)
│   └── argv.ts          argv → payload, @file/@stdin/@env, ajv validation
├── utils/
│   ├── errors.ts        CliError, ExitCode, fatalError
│   └── paths.ts         config dir resolution (XDG + legacy APPDATA migration)
├── skills/              builtin SKILL.md bundles (copied out by `siyuan skill install`)
└── docs/                this folder
```

## Request lifecycle: `siyuan api <id> ...`

```text
 1. citty parses argv                            src/cli.ts + src/commands/api.ts
 2. parsePayload() assembles payload             src/core/argv.ts
       ├── --json / -f / positional primary / --<field>
       ├── @file: / @stdin / @env: resolution by allowSource
       └── ajv validation
 3. loadConfig() + resolveWorkspace()            src/core/config.ts
 4. new SiyuanClient(workspace)                  src/core/client.ts
 5. createPermissionEngine(...)                  src/core/permission.ts
 6. executeEndpoint({...})                       src/core/guard.ts
       ├── engine.checkEndpoint(id)              allow/deny by id pattern
       ├── applyPayloadGuard(schema, ...)        payloadTargets → PointerPath → checkContentRef
       ├── debug preview (optional)
       ├── dry-run short-circuit for write-like
       ├── requiresConfirmation + --yes          risk + policy union
       ├── client.call(endpoint, payload)        or client.upload() for multipart
       └── applyResponseGuard(...)               declarative response filter + write-back
 7. write JSON to stdout
```

## Request lifecycle: `siyuan tool <id> ...`

```text
 1. parsePayload() for tool input                src/core/argv.ts
 2. createToolContext(args, toolId)              src/core/tools.ts
       ├── permission.checkTool(id)
       └── wires callEndpoint / callEndpointRaw
 3. tool.run(ctx, input) → ToolResult
 4. renderToolResult() writes to stdout/stderr   default: content only
                                                  --details: { content, details }
                                                  --only details: details only
```

## Three extension points

| You want to | Touch |
|---|---|
| Expose a new kernel API as `siyuan api <group>.<name>` | `src/apis/<group>/<name>.ts` + `src/apis/index.ts` |
| Compose several endpoints into one high-level tool | `src/tools/<tool-id>.ts` + `src/tools/index.ts` |
| Change how permissions or argv are parsed | `src/core/permission.ts` / `src/core/argv.ts` — rare, last resort |

## Registration chain

```text
import "./apis/index.js"     → registers all EndpointSchema
import "./tools/index.js"    → registers all ToolSchema
```

Both are pulled in by `src/cli.ts` and by any command that needs the registries.
`registry.register(schema)` runs `validateSchema()` which enforces structural invariants at startup — see `11-classification-and-risk.md`.

## Key invariants

- endpoint id format: `/api/<group>/<name>` → id `<group>.<name>`
- every `EndpointSchema` must have `classification`; `risk` and `requiresConfirmation` are derived, not authored
- every `payloadTargets[*].path` must start with a property declared in `schema.payload.properties`
- every `mode:"read" + scope:"global"` endpoint must have `guard.response` or `guard.filterResponse`
- tool ids are kebab-case; endpoint ids are `group.name`

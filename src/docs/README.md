---
title: SiYuan CLI Internal Docs
slug: internal-docs-index
summary: Curated internal reference for agents building on and extending the SiYuan CLI.
---

# Internal Docs Index

Two tracks, read the one you need.

## `guides/` — SiYuan business knowledge

Read these when reasoning about SiYuan content, not the CLI itself.

1. `guides/siyuan-block.md` — block as primary data model, block vs Markdown
2. `guides/document-tree-and-paths.md` — id / parent_id / root_id / box / path / hpath
3. `guides/sql-query-guide.md` — blocks / refs / attributes / assets / spans
4. `guides/dailynote-model.md` — daily note path template, attribute marker, date range queries

## `extending/` — About `siyuan-cli` itself

Read these when extending the CLI itself.

- `extending/00-overview.md` — architecture map, request lifecycle
- `extending/10-endpoint-schema.md` — EndpointSchema field-by-field
- `extending/11-classification-and-risk.md` — mode / surface / scope / operation → risk
- `extending/12-guard-and-pointer-path.md` — payloadTargets / response / filterResponse / PointerPath
- `extending/13-cli-behavior.md` — primary / allowSource / @file / @stdin / @env / -j / -f
- `extending/20-tool-schema.md` — ToolSchema / ToolContext / callEndpoint vs callEndpointRaw
- `extending/30-config.md` — config.yaml shape, permission model, token sources
- `extending/31-workspace-resolution.md` — resolution chain, `.siyuan-cli.yaml`, permission override, `workspace which`
- `extending/40-adding-an-endpoint.md` — step-by-step for a public kernel API
- `extending/41-adding-a-private-endpoint.md` — reverse-engineering non-public kernel APIs
- `extending/42-adding-a-tool.md` — tool walkthrough
- `extending/90-errors-and-exit-codes.md` — CliError, ExitCode, error JSON shape

## Mental model

```text
user
  │
  ▼
citty CLI     ◀── src/cli.ts
  │
  ▼
argv parser   ◀── src/core/argv.ts        (payload assembly, @file/@stdin/@env)
  │
  ▼
registry      ◀── src/core/registry.ts    (EndpointSchema → RegisteredEndpoint)
  │
  ▼
permission    ◀── src/core/permission.ts  (endpoint allow/deny, content scope)
  │
  ▼
guard         ◀── src/core/guard.ts       (payloadTargets check, execute, response filter)
  │
  ▼
client        ◀── src/core/client.ts      (HTTP to kernel)
  │
  ▼
kernel response
  │
  ▼
response guard ◀── src/core/guard.ts      (PointerPath filter + write-back)
  │
  ▼
stdout JSON
```

---
name: endpoint-default-format
status: PLANNING
change-type: single
created: 2026-04-27T18:43:03
reference: null
---

# endpoint-default-format

## Problem Statement

54 of 61 endpoints lack a `format` function. When `--print compact` (the default), they fall back to raw `JSON.stringify` — verbose, token-wasteful for agents. An agent calling `siyuan api block.getBlockInfo --id xxx` gets ~200 chars of JSON where ~80 chars of key=value would suffice. At scale (multi-step workflows), this compounds into significant token waste.

Two metrics guide the solution: **information fidelity** (no loss) and **token compression** (minimal output).

## Proposed Solution

### Approach

Add a schema-level `formatStrategy` field — a set of pre-built rendering strategies that schemas can opt into. Endpoints with unique needs keep their custom `format` function (which takes precedence).

Resolution order: `schema.format` → `schema.formatStrategy` → JSON fallback.

Five strategies cover all endpoint categories:

| Strategy | Target | Rendering |
|----------|--------|-----------|
| `direct` | scalar `data` (string/number/string[]) | `String(data)` or join lines |
| `records` | array of objects (or nested under key) | `formatRecords` with auto-detected array location |
| `transaction` | write operation results | `OK ids=... ops=...` |
| `object` | single object (multiline-aware) | `key=val \| key=val` inline, or section mode for multiline values |
| `json` | complex nested objects | Compact JSON (lossless, every field matters) |

**Design constraints:**
- Format and guard are fully decoupled. `guard.response` is for permission filtering; format derives response shape via auto-detection.
- Error handling: `client.ts` already throws `CliError` on `code !== 0`. Format functions only see the unwrapped `data` field — no error handling needed in strategies.
- Object strategy detects multiline string values and switches to section mode automatically.

### Key Change

**Feat A: FormatStrategy type + schema field**
Add `FormatStrategy` type to `schema.ts`. Add optional `formatStrategy?: FormatStrategy` to `EndpointSchema`. This is additive — no breaking changes.

**Feat B: Strategy implementations in output.ts**
Five rendering functions, each taking `(data)` and returning `string`. The `records` strategy uses pure shape auto-detection (first array-valued key). The `object` strategy auto-detects multiline values and switches to section mode.

**Feat C: Resolution in command.ts**
Update `callEndpoint` to check `formatStrategy` when `format` is absent. Single if-else chain, ~10 lines.

**Feat D: Assign strategies to 54 endpoints**
Add `formatStrategy` to each endpoint schema. Categorization:
- `direct`: ~9 endpoints (scalar returns)
- `records`: ~4 endpoints (array returns with guard.response)
- `transaction`: ~20 endpoints (write operations)
- `object`: ~12 endpoints (flat object returns)
- `json`: ~9 endpoints (complex nested objects)

### Scope Summary

| File | Change |
|------|--------|
| `src/shared/schema.ts` | Add `FormatStrategy` type + field to `EndpointSchema` |
| `src/shared/output.ts` | Add 5 strategy renderers + `applyFormatStrategy` dispatcher |
| `src/api/command.ts` | Wire `formatStrategy` into `preparePrintedOutput` call |
| `src/api/endpoints/**/*.ts` (54 files) | Add `formatStrategy` to each schema |

### Design Reference

→ 详细技术设计见 [design.md](./design.md)

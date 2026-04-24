---
name: api-print-modes
status: REVIEW
change-type: single
created: 2026-04-20T17:26:01
reference: null
---

<!-- @RULE: Frontmatter
status: PLANNING | DOING | REVIEW | DONE | BLOCKED
change-type: single | sub
reference?: Array<{source, type: 'request'|'root-change'|'sub-change'|'prev-change'|'doc'|'revision', note?}>

Sub-change MUST link root:
reference:
  - source: ".sspec/changes/<root-change-dir>"
    type: "root-change"
    note: "Phase <n>: <phase-name>"

Single-change common reference:
reference:
  - source: ".sspec/requests/<request-file>.md"
    type: "request"
  - source: ".sspec/changes/<change-dir>"
    type: "prev-change"
    note: "Follow-up to <change-name>."
-->

# api-print-modes

## Problem Statement
Current `siyuan api <id>` calls always print raw JSON to stdout, while `siyuan tool <id>` already supports `content` vs `details` with `--print compact|json`. This asymmetry increases token cost for agent workflows and pushes users toward higher-level tools even when a direct API call is the right abstraction.

For this change, the user wants API calls to support a compact output path with formatter-defined string rendering, while preserving a reliable raw JSON escape hatch for machine consumption and formatter fallback.

## Proposed Solution
Add API print modes that mirror the tool UX: `--print compact|json`, with `compact` as the default for `siyuan api <id>`. Endpoint schemas may optionally define a top-level formatter function. When `--print compact` is selected, the CLI uses the formatter if present; otherwise it falls back to raw JSON. When `--print json` is selected, the CLI always prints raw JSON.

### Approach
The change stays within the current request lifecycle. Payload parsing, workspace resolution, permission checks, response filtering, dry-run behavior, and kernel transport remain unchanged. The new behavior is a final rendering layer applied after `executeEndpoint()` returns its already-guarded result.

The formatter hook is added to `EndpointSchema` as an optional top-level function. This is feasible because endpoint schemas already allow imperative hooks via `guard.filterResponse`. The main runtime additions are: API print arg parsing, centralized API result rendering, schema serialization updates for `api describe`, and endpoint-by-endpoint formatter adoption for selected read-heavy endpoints.

### Key Change
**Feat A: API Print Surface**
Add `--print compact|json` to `siyuan api <id>`, with `compact` as the default and `json` as the explicit raw-data mode.

**Feat B: Endpoint Compact Formatter Hook**
Extend `EndpointSchema` with an optional formatter function that receives the executed result plus call context and returns a compact string. Formatter execution happens after permission filtering. Formatter failures emit a warning to stderr and fall back to raw JSON stdout.

**Feat C: Incremental Endpoint Coverage**
Build framework support for all endpoints immediately, then add compact formatters first for selected high-value, read-heavy endpoints. Endpoints without a formatter continue to work via raw JSON fallback.

**Docs D: Public and Authoring Documentation**
Document API print modes in user docs and document the new schema hook in author docs so future endpoints can opt in consistently.

### Scope Summary
| File | Change |
|------|--------|
| `src/commands/api.ts` | Add `--print` arg and route endpoint results through API renderer |
| `src/core/schema.ts` | Extend `EndpointSchema` with formatter types/context |
| `src/core/argv.ts` | Update endpoint help text to describe API print modes |
| `src/core/tools.ts` or new shared renderer module | Reuse or extract shared print-mode rendering logic |
| `src/apis/**` | Add compact formatters for selected endpoints |
| `src/docs/cli-usage/cli-overview.md` | Document API output modes |
| `docs/extending/00-overview.md` | Update request lifecycle and extension-point docs |
| `docs/extending/10-endpoint-schema.md` | Document formatter hook in `EndpointSchema` |
| `docs/extending/13-cli-behavior.md` | Document `--print` for API commands |
| `docs/extending/40-adding-an-endpoint.md` | Add guidance for compact formatter adoption |
| `README.md` | Update user-facing command reference |

### Design Reference
→ Detailed technical design: [design.md](./design.md)

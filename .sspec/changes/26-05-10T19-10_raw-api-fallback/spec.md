---
name: raw-api-fallback
status: DONE
change-type: single
created: 2026-05-10 19:10:15
reference:
- source: .sspec/requests/26-05-07T13-00_expose-missing-kernel-apis.md
  type: request
  note: Linked from request; covers the raw API fallback half
---
<!-- MUST follow frontmatter schema:
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

# raw-api-fallback

## Problem Statement

<!-- Quantify impact. Format: "[metric] causing [impact]".
Simple: single paragraph. Complex: split into "Current state" + "User need". -->

0 fallback channel for unregistered kernel APIs causes Agents to wait for CLI endpoint registration or bypass siyuan-cli with direct curl, losing the CLI's workspace resolution and documented safety boundary.

## Proposed Solution

### Approach
<!-- Core solution (1-3 paragraphs) + why this approach over alternatives -->

Add `siyuan api raw <endpoint>` as an explicit fallback path for direct kernel API calls. It resolves the same workspace/token configuration as normal `siyuan api` commands, accepts JSON payload from inline/file/stdin, calls the kernel endpoint without `EndpointSchema` validation, and prints pure JSON to stdout.

Authorization is configuration-based, not inferred from incomplete schema metadata. A new `behavior.rawApi` block controls whether raw is enabled and which endpoint-id patterns are allowed. Both `enabled: true` and a non-empty allow pattern list are required; all other cases fail with a targeted raw error and a config example. Project-level `.siyuan-cli.yaml` may declare this block.

This deliberately keeps raw simple: no resource-level guard, no response filtering, no compact formatter, and no extra confirmation flow. The command emits raw-specific warnings to stderr only so stdout stays jq-friendly.

### Key Change
<!-- MUST label each independent change item as **Type Label: Title**.
Examples: **Fix A: Request linking** / **Feat B: Cache TTL jitter**
tasks.md references these labels — MUST NOT copy the design description.
If scope boundary is unclear, add a "What Stays Unchanged" block after Scope Summary.
Fence nesting: when showing content containing ```, outer fence MUST use more backticks (outer > inner). -->

**Config A: `behavior.rawApi` opt-in allowlist**

Add raw API configuration under `behavior` with default disabled behavior. `enabled: true` without `allow` is invalid for raw invocation; `allow: ["*"]` is the explicit all-endpoints escape hatch.

**Command B: `siyuan api raw <endpoint>`**

Add a meta subcommand under `siyuan api` that accepts `/api/<group>/<name>` or `<group>.<name>`, normalizes to endpoint id for pattern matching, then posts JSON to `/api/<group>/<name>`.

**UX C: Pure JSON stdout + stderr warnings**

Raw command stdout is always the unwrapped kernel response `data` as JSON. Warnings such as `RAW_API_NO_SCHEMA_GUARD` and disabled/allowlist failures go to stderr, keeping stdout parseable by `jq`.

**Docs D: Configuration and safety docs**

Document raw API config examples, explicit-all pattern, error hints, and the guard limitation in bundled CLI docs.

### Scope Summary
<!-- MUST end every spec with a File | Change table. -->

| File | Change |
|------|--------|
| `src/shared/schema.ts` | Add raw API behavior config types and validation shape. |
| `src/workspace/config.ts` | Normalize and resolve `behavior.rawApi` across defaults/workspace/project behavior. |
| `src/workspace/project-config.ts` | Accept and validate project-level `behavior.rawApi`. |
| `src/api/command.ts` | Add `raw` subcommand, endpoint normalization, allowlist check, raw kernel call, stderr warnings. |
| `src/shared/argv.ts` | Reuse or expose JSON payload loading for raw command without schema validation. |
| `src/docs/cli-usage/workspace-config.md` | Document `behavior.rawApi` configuration. |
| `src/docs/cli-usage/permission.md` | Document raw API safety boundary and lack of resource guard. |

### Design Reference
<!-- MUST create design.md when the change involves new interfaces, data model changes,
or architectural logic changes. Link here: → See [design.md](./design.md)
Simple changes MAY delete this section and describe the technical approach inline. -->

→ See [design.md](./design.md)

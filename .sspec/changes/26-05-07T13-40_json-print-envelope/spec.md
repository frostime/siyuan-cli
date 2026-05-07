---
name: json-print-envelope
status: PLANNING
change-type: single
created: 2026-05-07T13:40:48
reference: null
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

# json-print-envelope

## Problem Statement

`--print json` currently emits success data on stdout while warnings, notices, and approval events are written separately to stderr, so the JSON mode is split across two channels and cannot act as one internal machine contract.

## Proposed Solution

### Approach

Make `--print json` an envelope mode for `api` and `tool` commands. Success output becomes one fixed JSON object with `ok`, `data`, and `extra`; all non-fatal side-channel information that currently leaks through scattered stderr writes is collected into `extra` instead of being printed as standalone text or JSON fragments.

This keeps the stdout contract stable for jq-style consumers inside the repo while leaving fatal errors on the existing stderr error path. The change is scoped to the command surfaces that already honor `GlobalArgs.print`, so it does not broaden the CLI output model beyond the current JSON mode.

### Key Change

**Feat A: Fixed JSON envelope**
- `--print json` returns a single object shaped as `ok + data + extra`.
- `data` preserves the current machine payload: API endpoint result or `ToolResult.details`.
- `extra` carries non-primary output that used to be printed piecemeal.

**Refactor B: Diagnostic collection**
- Replace direct JSON/text writes for warnings, notices, debug preview, and approval events with an execution-local collector.
- Approval still blocks execution as today; only its intermediate and auxiliary output moves into the envelope.

**Refactor C: Command adapters**
- `api` and `tool` commands assemble the final envelope and write it once.
- `--print compact` keeps current behavior.
- Error handling keeps the existing `CliError` stderr path.

**Test D: JSON contract regression coverage**
- Add tests that parse stdout as a single JSON document.
- Add tests that verify warnings/approval diagnostics land in `extra` rather than stdout text.
- Add tests that preserve compact-mode output.

### Scope Summary

| File | Change |
|------|--------|
| `src/shared/output.ts` | Add JSON envelope types/rendering and final stringify path |
| `src/api/command.ts` | Emit envelope for API success paths |
| `src/api/guard.ts` | Stop direct diagnostic writes; feed collector instead |
| `src/approval/client.ts` | Route approval events into collector instead of bare stderr output |
| `src/tool/registry.ts` | Emit tool envelope and stop splitting json-mode output across channels |
| `tests/*.test.ts` | Add regression coverage for JSON parseability and extra-field placement |

### What Stays Unchanged

- `--print compact` output shape.
- Exit codes and `CliError` stderr emission for failures.
- Approval semantics, permission checks, and kernel call flow.

### Design Reference

→ See [design.md](./design.md)

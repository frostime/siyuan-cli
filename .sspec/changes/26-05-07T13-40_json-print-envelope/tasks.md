---
change: "json-print-envelope"
updated: 2026-05-07T13:42+08:00
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Envelope plumbing ✅
- [x] Update `src/shared/output.ts` to add a minimal json envelope helper per design §1-§2
- [x] Update `src/api/command.ts` to emit envelope-shaped stdout for `--print json`
- [x] Update `src/tool/registry.ts` to emit envelope-shaped stdout for `--print json`
**Verification**: `pnpm run typecheck` passes; json-mode still prints one line-delimited JSON document on stdout for a successful `api` and `tool` command

### Phase 2: Diagnostic collection ✅
- [x] Update `src/api/guard.ts` to route warnings/notices/debug into the collector instead of direct stderr JSON writes
- [x] Update `src/approval/client.ts` to route approval events into the collector instead of direct stderr JSON writes
- [x] Keep `src/shared/errors.ts` fatal error path unchanged
**Verification**: approval and guard diagnostics no longer appear as standalone stdout text; fatal errors still emit via stderr JSON

### Phase 3: Regression coverage ✅
- [x] Add JSON parseability and envelope-placement tests in `tests/core-contracts.test.ts`
- [x] Extend tool/API smoke coverage if needed to assert compact mode is unchanged
**Verification**: new tests pass; stdout from json mode parses with `JSON.parse`

## Feedback Tasks

*(none yet)*

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |

**Recent**:
- [2026-05-07T13:42+08:00] Plan initialized from approved design.
- [2026-05-07T13:xx+08:00] Implemented json-print envelope, diagnostic collection, and regression coverage; full test run still shows two unrelated pre-existing failures in block-operations and extension-system.
- [2026-05-07T15:11+08:00] Revised approval diagnostics rule: they stay on stderr in json mode and are mirrored into json extra for envelope consumers.

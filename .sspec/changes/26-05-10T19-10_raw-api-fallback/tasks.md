---
change: "raw-api-fallback"
updated: "2026-05-10T19:40+08:00"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Raw behavior config ⏳
- [x] Update `src/shared/schema.ts` — add `RawApiBehaviorConfig`, resolved raw type, and validation for `behavior.rawApi` per spec.
- [x] Update `src/workspace/config.ts` — normalize and resolve raw behavior as a whole object across defaults/workspace/project.
- [x] Update `src/workspace/project-config.ts` — allow project-level `behavior.rawApi` through existing behavior validation.
**Verification**: `pnpm run typecheck`; invalid raw config produces config parse error while unknown keys still warn.

### Phase 2: Raw API command ⏳
- [x] Update `src/shared/argv.ts` — expose a schema-free JSON payload parser for `--json` / `--file` / stdin reuse.
- [x] Update `src/api/command.ts` — add `siyuan api raw <endpoint>` command, endpoint normalization, raw allowlist check, stderr warning, and pure JSON stdout.
**Verification**: `pnpm run typecheck`; `pnpm run siyuan api --help` lists `raw`; raw disabled/allowlist errors return targeted error codes.

### Phase 3: Docs and smoke checks ⏳
- [x] Update `src/docs/cli-usage/workspace-config.md` — document `behavior.rawApi` examples and explicit `"*"` all-open pattern.
- [x] Update `src/docs/cli-usage/permission.md` — document raw API boundary: no schema/resource guard/response filtering.
- [x] Run verification commands and update progress.
**Verification**: `pnpm run typecheck`; command help renders; raw config docs match implemented field names.

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |

**Recent**:
- [2026-05-10T19:40+08:00] Plan created for raw-api-fallback implementation.
- [2026-05-10T19:43+08:00] Added raw API behavior types and validation.
- [2026-05-10T19:46+08:00] Added raw API behavior normalization and resolution.
- [2026-05-10T19:47+08:00] Confirmed project config accepts rawApi through shared behavior validation.
- [2026-05-10T19:49+08:00] Extracted schema-free JSON payload parsing for raw command reuse.
- [2026-05-10T19:54+08:00] Added config-gated `siyuan api raw` command implementation.
- [2026-05-10T19:56+08:00] Documented raw API behavior config in workspace config docs.
- [2026-05-10T19:57+08:00] Documented raw API safety boundary in permission docs.
- [2026-05-10T19:48+08:00] Verified typecheck/build/help/raw disabled/allow-required/denied/allowed/path-input smoke checks; full test suite has one unrelated pre-existing getChildBlocks assertion failure.
- [2026-05-10T20:02+08:00] Verified raw `asset.getDocAssets` against dev workspace by temporarily editing project `.siyuan-cli.yaml`; restored config with no diff.

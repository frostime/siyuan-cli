---
change: "api-print-modes"
updated: ""
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Feasibility and design alignment ✅
- [x] Inspect current API/tool output lifecycle across `src/commands/api.ts`, `src/commands/tool.ts`, `src/core/tools.ts`, `src/core/argv.ts`, `src/core/schema.ts`, `src/core/guard.ts`
- [x] Inspect user docs and extension docs under `src/docs/` and `docs/extending/`
- [x] Capture design choices for default mode, schema hook placement, rollout scope, and formatter failure behavior
- [x] Write `spec.md` and `design.md` for change `26-04-20T17-26_api-print-modes`
**Verification**: Design gate prepared with lifecycle-based feasibility assessment and explicit decision items.

### Phase 2: Print framework implementation ✅
- [x] Extend `src/core/schema.ts` with endpoint formatter types and schema field
- [x] Create shared output rendering helper in `src/core/` and migrate tool rendering to it
- [x] Update `src/commands/api.ts` to accept `--print`, render endpoint results, and serialize formatter hooks in `describe`
- [x] Update `src/core/argv.ts` endpoint help text to document API output modes
**Verification**: `siyuan api <id> --help` shows print behavior, `api describe` remains serializable, and API/tool rendering both compile against shared helpers.

### Phase 3: Endpoint compact formatter rollout ✅
- [x] Add compact formatter to `src/apis/query/sql.ts`
- [x] Add compact formatter to `src/apis/block/getBlockKramdown.ts`
- [x] Add compact formatter to `src/apis/search/fullTextSearchBlock.ts`
- [x] Add compact formatter to `src/apis/filetree/listDocsByPath.ts`
- [x] Add compact formatter to `src/apis/file/readDir.ts`
- [x] Add compact formatter to `src/apis/system/version.ts` and `src/apis/system/currentTime.ts`
**Verification**: Selected read-heavy endpoints produce compact text with `--print compact` and raw JSON with `--print json`.

### Phase 4: Docs and verification ✅
- [x] Update user docs in `README.md` and `src/docs/cli-usage/cli-overview.md`
- [x] Update author docs in `docs/extending/00-overview.md`, `10-endpoint-schema.md`, `13-cli-behavior.md`, and `40-adding-an-endpoint.md`
- [x] Run `pnpm typecheck` and `pnpm build`
- [x] Smoke-check help and describe output from `dist/cli.mjs`
**Verification**: Docs match implemented CLI surface and local build succeeds.

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 100% | ✅ |
| Phase 2 | 100% | ✅ |
| Phase 3 | 100% | ✅ |
| Phase 4 | 100% | ✅ |

**Recent**:
- Implemented shared output renderer and API `--print compact|json`
- Added compact formatters for selected read-heavy endpoints
- Updated user and author documentation
- Verified with `pnpm typecheck`, `pnpm build`, and CLI smoke checks
- Added local PowerShell batch smoke script at `scripts/smoke-api-print.ps1` and executed it successfully

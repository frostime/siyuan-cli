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
- [ ] Update `src/workspace/project-config.ts` — allow project-level `behavior.rawApi` through existing behavior validation.
**Verification**: `pnpm run typecheck`; invalid raw config produces config parse error while unknown keys still warn.

### Phase 2: Raw API command ⏳
- [ ] Update `src/shared/argv.ts` — expose a schema-free JSON payload parser for `--json` / `--file` / stdin reuse.
- [ ] Update `src/api/command.ts` — add `siyuan api raw <endpoint>` command, endpoint normalization, raw allowlist check, stderr warning, and pure JSON stdout.
**Verification**: `pnpm run typecheck`; `pnpm run siyuan api --help` lists `raw`; raw disabled/allowlist errors return targeted error codes.

### Phase 3: Docs and smoke checks ⏳
- [ ] Update `src/docs/cli-usage/workspace-config.md` — document `behavior.rawApi` examples and explicit `"*"` all-open pattern.
- [ ] Update `src/docs/cli-usage/permission.md` — document raw API boundary: no schema/resource guard/response filtering.
- [ ] Run verification commands and update progress.
**Verification**: `pnpm run typecheck`; command help renders; raw config docs match implemented field names.

---

## Progress

**Overall**: 22%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1 | 67% | 🚧 |
| Phase 2 | 0% | ⏳ |
| Phase 3 | 0% | ⏳ |

**Recent**:
- [2026-05-10T19:40+08:00] Plan created for raw-api-fallback implementation.
- [2026-05-10T19:43+08:00] Added raw API behavior types and validation.
- [2026-05-10T19:46+08:00] Added raw API behavior normalization and resolution.

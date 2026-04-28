---
change: extension-system-fixes
updated: "2026-04-28T22:24+08:00"
---

# Tasks: extension-system-fixes

## Phase 1 — Fix A: Type resolution

- [x] **T1** `src/extension/init.ts` — add explicit `"@frostime/siyuan-cli/schema"` path in `buildTsconfig`
  - Verify: `pnpm run build && grep "schema.d.mts" dist/extension/init.mjs` shows the new mapping string

## Phase 2 — Fix B: Visual separation

- [x] **T2** `src/api/registry.ts` — add `isExtension(id: string): boolean`
  - Verify: `pnpm run typecheck` passes
- [x] **T3** `src/tool/registry.ts` — add `isExtension(id: string): boolean`
  - Verify: `pnpm run typecheck` passes
- [x] **T4** `src/api/command.ts` — add grouped help renderer (`renderGroupedApiHelp`); append `"source"` to `listEndpoints` JSON
  - Verify: `pnpm run siyuan api -h` shows `META` / `BUILT-IN` / `USER EXTENSIONS` groups
  - Verify: `pnpm run siyuan api list` JSON items contain `"source": "builtin" | "extension"`
- [x] **T5** `src/tool/command.ts` — add grouped help renderer (`renderGroupedToolHelp`); append `"source"` to `listTools` JSON
  - Verify: `pnpm run siyuan tool -h` shows grouped sections
  - Verify: `pnpm run siyuan tool list` JSON items contain `"source"`
- [x] **T6** `src/cli.ts` — update `customShowUsage` to call grouped renderers for bare `api -h` / `tool -h`
  - Verify: `pnpm run siyuan api -h` and `pnpm run siyuan tool -h` both render grouped help

## Phase 3 — Fix C: Documentation

- [x] **T7** `src/docs/extension.md` — create authoring guide (layout, schema contract, cache, tsconfig, examples)
  - Verify: `pnpm run siyuan doc read extension.md` outputs content
- [x] **T8** `src/docs/README.md` — add extension quick-start under Quick start; update Help discovery table
  - Verify: file contains `extension` references
- [x] **T9** `skills/siyuan-cli/SKILL.md` — add extension capability bullets and example command
  - Verify: file contains `extension` references

## Phase 4 — Integration

- [x] **T10** Build and regression check
  - Verify: `pnpm run build` succeeds
  - Verify: `pnpm run typecheck` passes
  - Verify: `pnpm run siyuan api list` and `pnpm run siyuan tool list` output valid JSON with `source` field
  - Verify: `pnpm run siyuan api -h` and `pnpm run siyuan tool -h` show grouped sections (no flat COMMANDS table)

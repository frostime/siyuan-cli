---
change: "extension-system"
updated: "2026-04-28"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Foundation — paths + cache module ✅
- [x] Modify `src/workspace/paths.ts` — add `getExtensionDir()` returning `~/.config/siyuan-cli/extensions`
- [x] Create `src/extension/cache.ts` — `SchemaCacheEnvelope<T>` type, `CACHE_VERSION`, `readSchemaCache()`, `writeSchemaCache()`, `extractToolCacheData()`, `extractEndpointCacheData()` per design.md §3
- [x] Create `src/extension/loader.ts` — `discoverToolExtensions()`, `discoverEndpointExtensions()`, `loadToolExtension()`, `loadEndpointExtension()`, `loadAllToolExtensions()`, `loadAllEndpointExtensions()` per design.md §4. File scanning rules: include `*.ts`/`*.mjs`, exclude `*.d.ts`/`*.schema.json`/`*.test.ts`/`node_modules/`
- [x] Add export validation functions in loader: `validateToolExport()`, `validateEndpointExport()` per design.md §4.5
**Verification**: Added `tests/extension-system.test.ts` covering cache round-trip, `_version: 1`, stale detection, scan rules, and malformed export rejection.

### Phase 2: Registry integration ✅
- [x] Modify `src/tool/registry.ts` — add `ToolRegistry.registerExtension()` method: conflict → `console.warn` + return false per design.md §5
- [x] Modify `src/api/registry.ts` — add `EndpointRegistry.registerExtension()` method: same conflict handling; skip `validateSchema()` for user extensions (user endpoints may not have full guard specs)
**Verification**: Added registry conflict tests; duplicate builtin IDs warn+skip, unique extension registrations succeed and appear in registry list/get.

### Phase 3: Lazy loading hook in api/tool commands ✅
- [x] Modify `src/tool/command.ts` — add `ensureExtensions()` with module-level guard flag; call before tool dispatch. Discovery mode for list/help, full mode for execution. Piggyback `writeSchemaCache()` after successful execution per design.md §4.2
- [x] Modify `src/api/command.ts` — same pattern for endpoint extensions per design.md §4.2
- [x] Wire `jiti` import: lazy `createJiti()` instantiation (create once, reuse)
**Verification**: `node dist/cli.mjs tool list` shows cached user tools; `node dist/cli.mjs tool hello-ext --name Alice` executes via jiti and writes cache; builtin non-api/tool commands remain unaffected.

### Phase 4: `siyuan extension` subcommand ✅
- [x] Create `src/extension/init.ts` — scaffold `extensions/{apis,tools}/` with `.gitignore`, `tsconfig.json` (auto-detected paths via `import.meta.url`), `.gitkeep` files per design.md §7.1
- [x] Create `src/extension/command.ts` — define `extensionCommand` with `init`, `list`, `cache` sub-operations per design.md §7
- [x] Modify `src/cli.ts` — import and register `extensionCommand` in `subCommands`
**Verification**: `node dist/cli.mjs extension init/list/cache` all work; list shows `[cached]`/`[uncached]` plus hint text.

### Phase 5: Package type exports ✅
- [x] Modify `package.json` — add `main`, `types`, `exports` fields per design.md §8; add `jiti` to `dependencies`
- [x] Verify tsdown `dts: true` + `unbundle: true` generates `dist/shared/schema.d.mts` — adjust `tsdown.config.ts` entry if needed to ensure schema types are emitted
- [x] Verify `files` array in `package.json` includes `dist/**` (already present) — confirm `.d.mts` files are included in published package
**Verification**: `pnpm build` succeeds; `dist/shared/schema.d.mts` is emitted after adding explicit tsdown entry; package exports point `./schema` at built JS + DTS.

### Phase 6: End-to-end validation ✅
- [x] Create a sample tool extension in a temp directory, run `siyuan extension init`, copy sample to `tools/`, execute it, verify schema.json generated
- [x] Create a sample endpoint extension, same flow
- [x] Verify conflict: add extension with same id as builtin → warn + skip, CLI continues
- [x] Verify graceful degradation: malformed extension (missing `run`) → warn + skip, other extensions load fine
**Verification**: Full lifecycle validated with real files under `~/.config/siyuan-cli/extensions`: init → uncached list → cache generation → tool execution → cached list. Endpoint path validated through cache + discovery/registration; live endpoint execution was not exercised because it requires a running SiYuan kernel.

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: Foundation | 100% | ✅ |
| Phase 2: Registry | 100% | ✅ |
| Phase 3: Lazy loading | 100% | ✅ |
| Phase 4: Extension cmd | 100% | ✅ |
| Phase 5: Type exports | 100% | ✅ |
| Phase 6: E2E validation | 100% | ✅ |

### Feedback Tasks (→ [001-review-fix-subcommands](./revisions/001-review-fix-subcommands.md))
- [x] Fix `src/extension/loader.ts` — remove `{ default: false }` from `jiti.import()` (type error)
- [x] Restore `src/tool/command.ts` — revert positional dispatch to citty `subCommands` with lazy resolver
- [x] Restore `src/api/command.ts` — same revert
- [x] Restore `src/cli.ts` — remove `process.argv` manual parsing, keep `customShowUsage` structure
**Verification**: `tsc --noEmit` ✅ | `pnpm build` ✅ | `pnpm test` 64/64 ✅ | `--help` enumerates all tools/endpoints including cached extensions

---

## Progress

**Overall**: 100%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: Foundation | 100% | ✅ |
| Phase 2: Registry | 100% | ✅ |
| Phase 3: Lazy loading | 100% | ✅ |
| Phase 4: Extension cmd | 100% | ✅ |
| Phase 5: Type exports | 100% | ✅ |
| Phase 6: E2E validation | 100% | ✅ |
| Feedback: revision 001 | 100% | ✅ |

**Recent**:
- 2026-04-28: Implemented extension loader/cache/command flow, package exports, tests, and manual E2E validation
- 2026-04-28: Review fixes — restored subCommands pattern, fixed jiti type error (revision 001)

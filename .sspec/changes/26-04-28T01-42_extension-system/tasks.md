---
change: "extension-system"
updated: "2026-04-28"
---

# Tasks

## Legend
`[ ]` Todo | `[x]` Done

## Tasks

### Phase 1: Foundation — paths + cache module ⏳
- [ ] Modify `src/workspace/paths.ts` — add `getExtensionDir()` returning `~/.config/siyuan-cli/extensions`
- [ ] Create `src/extension/cache.ts` — `SchemaCacheEnvelope<T>` type, `CACHE_VERSION`, `readSchemaCache()`, `writeSchemaCache()`, `extractToolCacheData()`, `extractEndpointCacheData()` per design.md §3
- [ ] Create `src/extension/loader.ts` — `discoverToolExtensions()`, `discoverEndpointExtensions()`, `loadToolExtension()`, `loadEndpointExtension()`, `loadAllToolExtensions()`, `loadAllEndpointExtensions()` per design.md §4. File scanning rules: include `*.ts`/`*.mjs`, exclude `*.d.ts`/`*.schema.json`/`*.test.ts`/`node_modules/`
- [ ] Add export validation functions in loader: `validateToolExport()`, `validateEndpointExport()` per design.md §4.5
**Verification**: Unit test — `writeSchemaCache()` produces valid JSON with `_version: 1`; `readSchemaCache()` round-trips; stale detection works (mock mtime). Validation rejects malformed exports.

### Phase 2: Registry integration ⏳
- [ ] Modify `src/tool/registry.ts` — add `ToolRegistry.registerExtension()` method: conflict → `console.warn` + return false per design.md §5
- [ ] Modify `src/api/registry.ts` — add `EndpointRegistry.registerExtension()` method: same conflict handling; skip `validateSchema()` for user extensions (user endpoints may not have full guard specs)
**Verification**: `registerExtension()` with duplicate id logs warning and returns false; registration with unique id succeeds and appears in `list()`.

### Phase 3: Lazy loading hook in api/tool commands ⏳
- [ ] Modify `src/tool/command.ts` — add `ensureExtensions()` with module-level guard flag; call before tool dispatch. Discovery mode for list/help, full mode for execution. Piggyback `writeSchemaCache()` after successful execution per design.md §4.2
- [ ] Modify `src/api/command.ts` — same pattern for endpoint extensions per design.md §4.2
- [ ] Wire `jiti` import: lazy `createJiti()` instantiation (create once, reuse)
**Verification**: `siyuan tool list` shows user extensions from cache; `siyuan tool <ext-id>` jiti-imports and produces `*.schema.json` on first run; subsequent `list` shows `[cached]`. Builtin commands (`workspace`, `doc`, `skill`) unaffected — no extension loading overhead.

### Phase 4: `siyuan extension` subcommand ⏳
- [ ] Create `src/extension/init.ts` — scaffold `extensions/{apis,tools}/` with `.gitignore`, `tsconfig.json` (auto-detected paths via `import.meta.url`), `.gitkeep` files per design.md §7.1
- [ ] Create `src/extension/command.ts` — define `extensionCommand` with `init`, `list`, `cache` sub-operations per design.md §7
- [ ] Modify `src/cli.ts` — import and register `extensionCommand` in `subCommands`
**Verification**: `siyuan extension init` creates directory structure with correct tsconfig paths; `siyuan extension list` shows extensions with `[cached]`/`[stale]`/`[uncached]` status + hint message for uncached; `siyuan extension cache` batch-writes all schema.json files.

### Phase 5: Package type exports ⏳
- [ ] Modify `package.json` — add `main`, `types`, `exports` fields per design.md §8; add `jiti` to `dependencies`
- [ ] Verify tsdown `dts: true` + `unbundle: true` generates `dist/shared/schema.d.mts` — adjust `tsdown.config.ts` entry if needed to ensure schema types are emitted
- [ ] Verify `files` array in `package.json` includes `dist/**` (already present) — confirm `.d.mts` files are included in published package
**Verification**: `pnpm build` succeeds; `dist/shared/schema.d.mts` exists and contains `ToolSchema`/`EndpointSchema` exports; `node -e "import('@frostime/siyuan-cli/schema')"` resolves (after `npm link`).

### Phase 6: End-to-end validation ⏳
- [ ] Create a sample tool extension in a temp directory, run `siyuan extension init`, copy sample to `tools/`, execute it, verify schema.json generated
- [ ] Create a sample endpoint extension, same flow
- [ ] Verify conflict: add extension with same id as builtin → warn + skip, CLI continues
- [ ] Verify graceful degradation: malformed extension (missing `run`) → warn + skip, other extensions load fine
**Verification**: Full lifecycle works: init → write extension → execute → cache populated → list shows metadata. Error paths degrade gracefully.

---

## Progress

**Overall**: 0%

| Phase | Progress | Status |
|-------|----------|--------|
| Phase 1: Foundation | 0% | ⏳ |
| Phase 2: Registry | 0% | ⏳ |
| Phase 3: Lazy loading | 0% | ⏳ |
| Phase 4: Extension cmd | 0% | ⏳ |
| Phase 5: Type exports | 0% | ⏳ |
| Phase 6: E2E validation | 0% | ⏳ |

**Recent**:
- (none yet)

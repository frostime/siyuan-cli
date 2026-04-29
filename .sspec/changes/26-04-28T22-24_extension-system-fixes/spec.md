---
name: extension-system-fixes
status: REVIEW
change-type: single
created: 2026-04-28 22:24:00
reference:
- source: .sspec/changes/26-04-28T01-42_extension-system
  type: parent-change
  note: Fixes and docs for the extension-system change
- source: .sspec/changes/26-04-28T22-24_extension-system-fixes/revisions/001-raw-api-and-source-bootstrapping.md
  type: revision
  note: Raw API access for tools + package-local source bootstrapping guidance
- source: .sspec/changes/26-04-28T22-24_extension-system-fixes/revisions/002-extension-guidance-cold-start.md
  type: revision
  note: Strengthen cold-start extension guidance in help and docs
- source: .sspec/changes/26-04-28T22-24_extension-system-fixes/revisions/003-extension-validation-and-endpoint-spec.md
  type: revision
  note: Restore API extension schema-validation parity and add EndpointSchema spec-doc
- source: .sspec/changes/26-04-28T22-24_extension-system-fixes/revisions/004-unknown-command-cache-hint.md
  type: revision
  note: Add cache guidance when uncached or stale extensions trigger unknown command errors
---

# extension-system-fixes

## Problem Statement

The extension system shipped in change `26-04-28T01-42_extension-system` has three gaps blocking a clean developer experience:

1. **IDE type resolution fails for extension authors.** `siyuan extension init` generates a `tsconfig.json` with `"@frostime/siyuan-cli/*": ["<pkg>/dist/*"]`. TypeScript `paths` does a literal string substitution, so `import type { EndpointSchema } from "@frostime/siyuan-cli/schema"` resolves to `<pkg>/dist/schema` — a file that does not exist (types live in `dist/shared/schema.d.mts`). Extension authors must manually rewrite imports to deep paths, defeating the subpath-export abstraction.

2. **Built-in and user-extension commands are visually indistinguishable.** `siyuan api -h` and `siyuan tool -h` render a flat `COMMANDS` table via citty's `renderUsage`. User extensions (e.g. `hello-ext`, `custom.echo`) sort alphabetically alongside built-ins, giving no signal of provenance. The JSON `list` output also lacks a provenance field, so downstream scripts cannot filter by source.

3. **No documentation covers the extension system.** The `src/docs/` tree, `README.md`, and `skills/siyuan-cli/SKILL.md` contain no mention of how to write, register, or cache extensions.

## Proposed Solution

### Approach

Fix the three gaps with surgical, backward-compatible changes:

- **Fix A**: Correct the generated `tsconfig.json` paths so `"@frostime/siyuan-cli/schema"` maps to the real `.d.mts` file via an explicit `paths` entry.
- **Fix B**: Replace the flat `subCommands` object in `apiCommand` and `toolCommand` with a custom help renderer that groups commands into `META`, `BUILT-IN`, and `USER EXTENSIONS`. Add a `source` field (`"builtin" | "extension"`) to `list` JSON output. Registry classes gain an `isExtension(id)` predicate to support this without leaking internals.
- **Fix C**: Add `src/docs/extension.md` (authoring guide), update `src/docs/README.md` with a quick-start paragraph, and update `skills/siyuan-cli/SKILL.md` with extension capability notes.

### Key Change

**Fix A: Type resolution for extension authors**
- `src/extension/init.ts`: Generated `tsconfig.json` gains an explicit `"@frostime/siyuan-cli/schema"` path pointing to `shared/schema.d.mts` (relative to `detectPackageRoot()` output).

**Fix B: Visual separation of built-in vs user extensions**
- `src/api/registry.ts` & `src/tool/registry.ts`: Add `isExtension(id: string): boolean` method.
- `src/api/command.ts` & `src/tool/command.ts`: `subCommands` stays a flat dict (citty requires this for dispatch), but `apiCommand`/`toolCommand` gain a custom grouped help renderer. `list` output appends `"source": "builtin" | "extension"` to every item.
- `src/cli.ts`: `customShowUsage` updated to delegate to the new grouped renderer when the parent command is `api` or `tool` and no endpoint/tool-specific help is matched.

**Fix C: Documentation**
- `src/docs/extension.md` (new): Directory layout, schema contract, cache lifecycle, tsconfig explanation, and minimal `echo.ts` + `hello.ts` examples.
- `src/docs/README.md`: Add "User extensions" subsection under Quick start and update Help discovery table.
- `skills/siyuan-cli/SKILL.md`: Add extension capability bullets and example commands.

### Scope Summary

| File | Change |
|------|--------|
| `src/extension/init.ts` | Add explicit `"@frostime/siyuan-cli/schema"` path in generated tsconfig |
| `src/cli.ts` | Update `customShowUsage` for grouped help delegation |
| `src/api/registry.ts` | Add `isExtension(id)` |
| `src/tool/registry.ts` | Add `isExtension(id)` |
| `src/api/command.ts` | Add grouped help renderer; add `source` to `list` JSON |
| `src/tool/command.ts` | Add grouped help renderer; add `source` to `list` JSON |
| `src/docs/extension.md` | **New** — authoring guide |
| `src/docs/README.md` | Add extension quick-start + help discovery lines |
| `skills/siyuan-cli/SKILL.md` | Add extension capability notes |

### Design Reference

→ Detailed technical design in [design.md](./design.md)

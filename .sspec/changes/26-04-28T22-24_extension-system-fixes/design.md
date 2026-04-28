# Design: extension-system-fixes

## Fix A — Type resolution for extension authors

### Interface Contract

```ts
// src/extension/init.ts
export function detectPackageRoot(): string;
export function scaffoldExtensionDir(root: string): InitExtensionResult;
```

Generated `tsconfig.json` gains one extra paths entry:

```json
{
  "compilerOptions": {
    "paths": {
      "@frostime/siyuan-cli": ["${portableRoot}"],
      "@frostime/siyuan-cli/*": ["${portableRoot}/*"],
      "@frostime/siyuan-cli/schema": ["${portableRoot}/shared/schema.d.mts"]
    }
  }
}
```

The `"@frostime/siyuan-cli/schema"` entry is **required** because TS `paths` is literal string substitution. Without it, `"@frostime/siyuan-cli/schema"` → `"${portableRoot}/schema"` which does not exist. `detectPackageRoot()` is left unchanged.

## Fix B — Visual separation of built-in vs user extensions

### Data Architecture

Registry classes already track extension IDs in a private `extensionIds: Set<string>`. Expose it:

```ts
// src/api/registry.ts & src/tool/registry.ts
isExtension(id: string): boolean {
  return this.extensionIds.has(id);
}
```

### Behavioral Spec

`apiCommand` and `toolCommand` currently return a flat `subCommands` dict. citty requires a flat dict for dispatch, but `meta.showUsage` (or the top-level `customShowUsage`) can intercept `--help` and render custom text.

Help rendering flow:

```
runMain(main)
  └─ rawArgs contains --help
      └─ customShowUsage(cmd, parent)
          ├─ parentMeta.name === 'api' && meta?.name === undefined  →  renderGroupedApiHelp()
          ├─ parentMeta.name === 'tool' && meta?.name === undefined →  renderGroupedToolHelp()
          └─ otherwise → citty showUsage(cmd, parent)
```

The condition `meta?.name === undefined` identifies the parent command itself (not a specific subcommand like `api query.sql --help`).

### Outcome Preview

`siyuan api -h` after fix:

```
Call SiYuan kernel API endpoints directly. (siyuan api v0.9.0)

USAGE siyuan api [OPTIONS] <command>

META
  list       List all registered API endpoints.
  describe   Show full EndpointSchema for an endpoint.

BUILT-IN
  asset.upload              Upload assets
  attr.getBlockAttrs        Get block attributes
  ... (remaining builtins)

USER EXTENSIONS
  custom.echo               Echo payload
```

`siyuan tool list` JSON after fix:

```json
[
  { "id": "append-content", "summary": "...", "source": "builtin" },
  { "id": "hello-ext", "summary": "Hello extension", "source": "extension" }
]
```

### Implementation Notes

- Grouped help uses the same `formatLineColumns` logic style as citty (max-width padding) for visual consistency.
- `list` output: `source` field is added only when the command itself is `list`, not for `describe` (which dumps the full schema object).
- The `customShowUsage` in `cli.ts` already intercepts `api <id> --help` and `tool <id> --help`; the new grouped renderer only fires for the bare `api -h` / `tool -h` case.

## Fix C — Documentation

### Content Outline

`src/docs/extension.md`:

```
# User Extensions

## Overview
## Directory Layout
## Getting Started (siyuan extension init)
## Writing an API Extension (echo.ts example)
## Writing a Tool Extension (hello.ts example)
## Schema Cache
## TypeScript Configuration
## Troubleshooting
```

`src/docs/README.md` changes:
- Under "Quick start", add a 3-line block: `siyuan extension init`, then `siyuan extension list`.
- Under "Help discovery", add `siyuan extension --help` and `siyuan extension list` rows.

`skills/siyuan-cli/SKILL.md` changes:
- Add bullet under capabilities: "User extensions — write custom API endpoints and workflow tools in `~/.config/siyuan-cli/extensions/`"
- Add example: `siyuan tool hello-ext --name Alice`

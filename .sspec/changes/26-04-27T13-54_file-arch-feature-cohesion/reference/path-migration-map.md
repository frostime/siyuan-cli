# Path Migration Map (Option B)

## 1) Directory-level mapping

| Old | New |
|---|---|
| `src/commands/api.ts` | `src/api/command.ts` |
| `src/commands/tool.ts` | `src/tool/command.ts` |
| `src/commands/workspace.ts` | `src/workspace/command.ts` |
| `src/commands/doc.ts` | `src/doc/command.ts` |
| `src/commands/skill.ts` | `src/skill/command.ts` |
| `src/core/registry.ts` | `src/api/registry.ts` |
| `src/core/guard.ts` | `src/api/guard.ts` |
| `src/core/msys-path.ts` | `src/api/msys-path.ts` |
| `src/core/tools.ts` | `src/tool/registry.ts` |
| `src/core/docs.ts` | `src/doc/runtime.ts` |
| `src/core/skills.ts` | `src/skill/runtime.ts` |
| `src/core/config.ts` | `src/workspace/config.ts` |
| `src/utils/paths.ts` | `src/workspace/paths.ts` |
| `src/utils/project-config.ts` | `src/workspace/project-config.ts` |
| `src/utils/diagnostics.ts` | `src/workspace/diagnostics.ts` |
| `src/core/schema.ts` | `src/shared/schema.ts` |
| `src/utils/errors.ts` | `src/shared/errors.ts` |
| `src/core/client.ts` | `src/shared/client.ts` |
| `src/core/permission.ts` | `src/shared/permission.ts` |
| `src/core/argv.ts` | `src/shared/argv.ts` |
| `src/core/output.ts` | `src/shared/output.ts` |
| `src/utils/sql.ts` | `src/shared/sql.ts` |
| `src/apis/index.ts` | `src/api/endpoints/index.ts` |
| `src/apis/**` | `src/api/endpoints/**` |
| `src/tools/index.ts` | `src/tool/builtins/index.ts` |
| `src/tools/**` | `src/tool/builtins/**` |

## 2) Explicit keep-as-is

| Path | Reason |
|---|---|
| `src/approval/**` | Already feature-cohesive; includes broker + UI assets |
| `src/docs/**` | Bundled user docs content |
| `src/skills/**` | Bundled skill templates |
| `src/cli.ts` | CLI root entry remains stable |

## 3) Import rewrite rules (mechanical)

- Replace `./commands/<name>.js` in `src/cli.ts` with:
  - `./api/command.js`
  - `./tool/command.js`
  - `./workspace/command.js`
  - `./doc/command.js`
  - `./skill/command.js`
- Replace `./core/argv.js` -> `./shared/argv.js` in `src/cli.ts`.
- Replace `./core/registry.js` -> `./api/registry.js` in `src/cli.ts`.
- Replace `./core/tools.js` -> `./tool/registry.js` in `src/cli.ts`.

Source-wide rewrite classes:
- `../core/schema.js` -> `../shared/schema.js` (or adjusted relative path)
- `../utils/errors.js` -> `../shared/errors.js`
- `../core/client.js` -> `../shared/client.js`
- `../core/permission.js` -> `../shared/permission.js`
- `../core/argv.js` -> `../shared/argv.js` (except moved API command keeps local relative)
- `../core/output.js` -> `../shared/output.js`
- `../utils/sql.js` -> `../shared/sql.js`
- `../core/config.js` -> `../workspace/config.js`
- `../utils/paths.js` -> `../workspace/paths.js`
- `../utils/project-config.js` -> `../workspace/project-config.js`
- `../utils/diagnostics.js` -> `../workspace/diagnostics.js`
- `../core/registry.js` -> `../api/registry.js`
- `../core/guard.js` -> `../api/guard.js`
- `../core/msys-path.js` -> `../api/msys-path.js`
- `../core/tools.js` -> `../tool/registry.js`
- `../core/docs.js` -> `../doc/runtime.js`
- `../core/skills.js` -> `../skill/runtime.js`

Tests/doc references:
- `../src/core/*` -> new feature/shared paths
- `../src/apis/*` -> `../src/api/endpoints/*`
- patch path text in `docs/**`
- scan and patch path text in `src/docs/**` if present

## 4) Execution sequence (mv-first)

1. Create target dirs:
   - `src/api/endpoints`, `src/tool/builtins`, `src/workspace`, `src/doc`, `src/skill`, `src/shared`
2. Move files by table in §1.
3. Patch imports in `src/**`.
4. Patch imports in `tests/**`.
5. Patch path mentions in `docs/**` and scan/patch `src/docs/**`.
6. Run `pnpm typecheck` and `pnpm test`.
7. Remove empty legacy dirs: `src/commands`, `src/core`, `src/utils`, `src/apis`, `src/tools`.

## 5) Non-goals

- No behavior change in command semantics, approval workflow, permission logic, or output formatting.
- No rename of command names (`siyuan api/tool/workspace/doc/skill/approval` unchanged).
- No schema/type contract changes.

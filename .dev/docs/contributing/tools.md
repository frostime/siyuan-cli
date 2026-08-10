---
name: contributing-tools
summary: Workflow and design rules for adding multi-step siyuan-cli workflow tools.
updated: 2026-08-10
scope:
  - /src/tool/**
  - /src/api/guard.ts
  - /src/shared/permission.ts
---

# Adding a Tool

Add a tool when the user-facing action needs **multiple endpoint calls, aggregation, formatting, or resolution logic**. If one Kernel endpoint already expresses the action, expose or use `siyuan-cli api <id>` instead of adding a proxy tool.

The current implementation is a useful reference: `src/tool/builtins/search-backlinks.ts`.

## Workflow

1. **Define the user value** in one sentence. State why a direct endpoint is insufficient.
2. **Define the input schema** in a new `ToolSchema` under `src/tool/builtins/`.
   - Pin ID patterns and other constrained values.
   - Add `cli.primary` only for the obvious positional field.
   - Declare `classification`; built-in tools need the current `{ action, domain }` model.
3. **Declare the tool-level resource guard** when the input names a protected ID, notebook, or path. Use `guard.payloadTargets` for direct fields and an explicit `ctx.permission.checkContentRef()` for embedded or polymorphic references.
4. **Implement `run()`**.
   - Use `ctx.callEndpoint()` for calls visible to the user's operation; this preserves payload validation, permission, approval, dry-run, and debug behavior.
   - Use `bypassPermission: true` only after the tool has already performed the authoritative resource check.
   - Use `ctx.callEndpointRaw()` only for internal lookups where re-entering the guard pipeline would distort the tool's semantics. It skips permission, approval, dry-run, and debug.
5. **Shape the result**:
   - `content`: concise human-readable output;
   - `details`: structured data for programs, including the original target/input;
   - `meta`: counts or truncation information that should not pollute normal output;
   - `warnings`: partial or degraded results that are still successful.
6. **Honor dry-run for write-capable tools**. Return the planned operations before any write endpoint or local file write. Read-only tools do not need artificial dry-run behavior.
7. **Register the tool** in `src/tool/builtins/index.ts`.
8. **Verify locally**:

   ```sh
   pnpm typecheck
   pnpm build
   pnpm run siyuan tool list
   pnpm run siyuan tool <id> --help
   pnpm run siyuan tool <id> <minimal-input>
   pnpm run siyuan tool <id> <minimal-input> --print json
   ```

For permission and approval semantics, read [Permission model](../permission-model.md#tool-level-permission-enforcement). For structured failures, read [Error model](../error-model.md).

## Design rules

- Prefer several focused tools over one tool with unrelated presentation modes.
- Do not create a tool that only forwards one endpoint call.
- Do not call the Kernel client directly from a tool; that bypasses the guard boundary.
- Escape user-controlled strings before embedding them in SQL literals, or use an endpoint that avoids string construction.
- Do not silently truncate output; include `meta.truncated` or a warning.
- Keep full records in `details`, not in the human-facing `content`.
- Check both read and write access when a write tool must inspect a protected resource before changing it.
- Throw a specific `CliError` when the caller needs a stable machine-readable category; otherwise use the normal error conversion path.

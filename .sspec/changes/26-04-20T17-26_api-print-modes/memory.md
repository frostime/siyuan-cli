# Memory: api-print-modes

**Updated**: <!-- ISO timestamp, minute precision -->

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `refactor/output-format`
- HEAD: `21986dec4e0336480792c70af3602903523058dc`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## refactor/output-format
```

## State
Implementation is complete for the approved print-mode design. Next step is user review of the compact API output behavior and any formatter-shape feedback before entering sspec review/acceptance.

## Key Files
- `src/commands/api.ts` — current API command path; will gain `--print` and centralized result rendering.
- `src/core/schema.ts` — `EndpointSchema` extension point for the new formatter hook.
- `src/core/argv.ts` — endpoint help generation; must describe API print modes.
- `src/core/tools.ts` — existing tool print renderer; likely source to reuse or extract shared rendering logic.
- `src/core/guard.ts` — confirms formatting can happen after guarded result execution without affecting safety.
- `src/docs/cli-usage/cli-overview.md` — published user docs that must explain the API output-mode change.
- `docs/extending/10-endpoint-schema.md` — authoring docs for future endpoint formatters.
- `docs/extending/13-cli-behavior.md` — CLI surface documentation for `--print` behavior.

## Knowledge
- [2026-04-20T17:48+08:00] [Decision] User chose `compact` as the default API print mode for this change.
- [2026-04-20T17:48+08:00] [Decision] User prefers a top-level `format(...)` hook on `EndpointSchema`.
- [2026-04-20T17:48+08:00] [Decision] Rollout direction is framework support now plus formatter adoption for selected high-value and broader read-heavy endpoints.
- [2026-04-20T17:48+08:00] [Decision] Formatter failures should warn and fall back to raw JSON.
- [2026-04-20T17:48+08:00] [Constraint] Existing `siyuan api <id>` stdout default is raw JSON today, so switching default to compact is a CLI surface change that needs prominent docs.
- [2026-04-20T17:48+08:00] [Constraint] `executeEndpoint()` already returns post-guard results, so compact rendering can stay a final presentation layer with no permission-model change.
- [2026-04-20T17:48+08:00] [Gotcha] `api describe` currently serializes `guard.filterResponse` as `[Function]`; it will need parallel handling for endpoint format hooks.
- [2026-04-20T19:09+08:00] [Decision] Shared print handling lives in new `src/core/output.ts`, used by both API and tool rendering paths.
- [2026-04-20T19:09+08:00] [Decision] `--print json` for APIs prints raw result JSON, which may remain a JSON string for scalar endpoints like `system.version`.
- [2026-04-20T19:09+08:00] [Gotcha] `system.currentTime` is classified as `invoke`-like confirmation-required in the current local runtime behavior, so smoke testing that endpoint needs `--yes` or `--dry-run` depending on workspace policy.
- [2026-04-20T19:09+08:00] [Gotcha] Existing `pnpm test` fails from unrelated stale test imports in `tests/*.test.ts` against missing exports from `src/core/permission.ts`; typecheck and build are green.

## Milestones
- [2026-04-20T17:48+08:00] Created change `26-04-20T17-26_api-print-modes`, completed feasibility analysis, and drafted design-gate materials.
- [2026-04-20T19:09+08:00] Implemented API print modes, endpoint formatters, docs updates, and completed typecheck/build smoke verification.

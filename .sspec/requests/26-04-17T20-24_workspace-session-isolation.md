---
name: workspace-session-isolation
created: 2026-04-17T20:24:34
status: OPEN
attach-change: null
tldr: "Global config.current breaks cross-session workspace isolation; project-level .siyuan-cli.yaml plus load-time validation solves P1, unlocks P2, and the P3 smoke-test naturally folds in."
---

# Request: workspace-session-isolation

## Background

siyuan-cli resolves the active workspace per invocation (CLI is one-shot; every `siyuan ...` is a fresh process). Current resolution chain:

```
--workspace flag  >  $SIYUAN_CLI_WORKSPACE  >  config.current (global YAML)
```

`config.current` lives in `~/.config/siyuan-cli/config.yaml` (or whatever `SIYUAN_CLI_CONFIG` points to). It is globally shared mutable state. Relevant code: `src/utils/paths.ts`, `src/core/config.ts::resolveWorkspace`.

## Problems

### P1 — Cross-session workspace conflict (must fix)

`config.current` is globally shared. `siyuan workspace use dev` in one terminal silently redirects every other in-flight session/agent. Worse than `npm install -g`: there, mutation is explicit in the command name; here, `workspace use` looks local but is global.

None of the obvious quick fixes actually isolate:
- PID lockfile: PID changes per invocation, lock is meaningless
- env var: `workspace use` in a child shell dies with the shell; agent must propagate env itself, CLI cannot enforce
- `config.current` itself: globally shared by design

### P2 — Same workspace, different projects, different permissions (P1 byproduct)

`permission` cascade today is two-layer: `workspaces[name].permission ?? defaults.permission` (see `src/core/permission.ts::getPermission`). To get "prod (read-only) in project A, prod (read-write) in project B" today, users must duplicate the workspace under two names. Acceptable but clunky. Project-level file removes the need.

### P3 — `notebooks` / `paths` fill-in guidance (partially solved)

Solved in docs: `src/docs/extending/30-config.md` and `src/docs/siyuan-guide/document-tree-and-paths.md` now state that `notebooks.*` takes notebook IDs and `paths.*` takes ID-based SiYuan paths. Still missing:

- **load-time smoke-test warning**: if a rule entry looks like an hpath (contains `/`, non-ASCII, no `\d{14}-[0-9a-z]{7}` pattern), emit a non-fatal warning on config load
- **write-time implicit-workspace warning**: when a write-like call resolves workspace via the lowest-priority source (`config.current`), emit a `IMPLICIT_WORKSPACE` warning to stderr; does not block

Both are small and can ship independently of P1.

## Chosen Direction: `.siyuan-cli.yaml` project-level file

### File format

```yaml
# .siyuan-cli.yaml — project-level siyuan-cli config
workspace: prod

permission:
  # same shape as global permission block; see extending/30-config.md
  endpoints:
    deny: ["block.delete*"]
  content:
    notebooks:
      allow: ["20260101215354-j0c5gvk"]
    paths:
      deny: ["/20260107143325-zbrtqup/**"]
```

### Resolution chain (new)

```
--workspace flag
  > $SIYUAN_CLI_WORKSPACE env
  > .siyuan-cli.yaml  (walk from cwd upward, stop at first hit; do NOT read $HOME/.siyuan-cli.yaml)
  > config.current    (if used for a write, emit IMPLICIT_WORKSPACE warning)
```

Reached filesystem root without a hit → fall back to `config.current`. `$HOME/.siyuan-cli.yaml` is never read (it would collide semantically with the global XDG config).

**Note**: `SIYUAN_CLI_CONFIG` only selects which global config file is loaded; it has no bearing on this resolution chain. Project file beats global config regardless of `SIYUAN_CLI_CONFIG`.

### Load-time validation (fail-fast, following the revision-003 precedent)

Inspired by `registry.ts::validateSchema` — everything we can check at load time, we do:

1. `workspace: <name>` must be in `config.workspaces`; otherwise throw `WORKSPACE_NOT_FOUND` with hint `siyuan workspace add <name>`
2. `token` / `baseUrl` / `tokenSource` at any level → throw `PROJECT_CONFIG_REJECTED_FIELD`; never silently ignore
3. `permission.notebooks.{allow,deny}` entries not matching `^\d{14}-[0-9a-z]{7}$` → stderr warning `LIKELY_HPATH_NOT_ID` (non-fatal — user intent may evolve)
4. `permission.paths.{allow,deny}` entries without a notebook-id segment (e.g. `/private/**` with no `20260...`) → same soft warning
5. Unknown top-level keys → stderr warning `UNKNOWN_PROJECT_CONFIG_KEY`

### Permission merge strategy: two-layer override, not three

Project-level `permission`, if present, **completely replaces** the effective permission for this call. No merge with `workspaces[name].permission` or `defaults.permission`.

Rationale: same as the current in-code cascade — debug-ability. "Why is this rule not firing?" should have at most two candidate answers.

### `ResolvedWorkspace` gains a source tag

```ts
interface ResolvedWorkspace {
  name: string;
  baseUrl: string;
  token?: string;
  tokenSource?: TokenSource;
  permission?: PermissionConfig;
  source: "flag" | "env" | "project-file" | "global-current";
}
```

`IMPLICIT_WORKSPACE` warning fires iff `source === "global-current"` AND `classification.mode !== "read"`. Agent side can decide whether to treat the warning as an error.

### What is NOT added

- **No `siyuan workspace use --local` command**: manual YAML edit is simpler; the sub-command introduces create-or-update ambiguity. Reconsider after user feedback.
- **No merge with `$HOME/.siyuan-cli.yaml`**: redundant with global XDG config.
- **No three-layer permission merge**: see above.
- **No aliasing of notebook IDs**: ugly but stable. Revisit if users report real readability pain.

### gitignore strategy

Since `token` / `baseUrl` / `tokenSource` are **hard-errored**, the project file is by construction safe to commit. Document this explicitly. Ship a `.siyuan-cli.yaml.example` template in the repo root.

## Success Criteria

1. Two different cwds can run concurrent `siyuan` commands against different workspaces, no cross-talk
2. Same workspace, different project dirs → different effective permissions
3. Existing `--workspace` flag and `$SIYUAN_CLI_WORKSPACE` usage unchanged
4. `config.current` is bottom fallback; write-like operations using it emit `IMPLICIT_WORKSPACE`
5. Project-file `token` / `baseUrl` / `tokenSource` → hard error
6. Project-file `workspace: <unknown>` → hard error
7. `notebooks` / `paths` rules that look like hpath → soft warning at load time
8. `ResolvedWorkspace.source` threaded through the code path so warnings are trivial to emit
9. `src/docs/extending/30-config.md` updated; new `src/docs/extending/31-workspace-resolution.md` added
10. Agent skill template references project-file mechanism as the recommended pattern

## Related code touchpoints

- `src/utils/paths.ts` — add `findProjectConfig(startDir)` walking upward
- `src/core/config.ts` — `resolveWorkspace` returns `ResolvedWorkspace` with `source`; `AppConfig` unchanged
- `src/core/permission.ts::getPermission` — accept optional project-level override
- `src/commands/api.ts`, `src/core/tools.ts` — share a single `resolveEffectiveWorkspace()` helper
- `src/core/guard.ts::executeEndpoint` — emit `IMPLICIT_WORKSPACE` warning
- `src/docs/extending/30-config.md` — document project-level override
- `src/docs/extending/31-workspace-resolution.md` — new, walk through the resolution chain
- `.siyuan-cli.yaml.example` — new, repo-root template

## Phasing

- **Phase 1** (ships standalone, P3 residue): load-time hpath-like smoke-test warnings; `IMPLICIT_WORKSPACE` warning on write via `config.current`; threading `ResolvedWorkspace.source` — these are small and orthogonal to the file format
- **Phase 2** (core): `.siyuan-cli.yaml` discovery + validation + permission override
- **Phase 3** (observe): decide on ID aliasing / `workspace use --local` after real usage

---

## @AGENT

我已经把这个问题提交给 Web Claude 咨询他的意见，获得了一份完整的指南 ".sspec/requests/reference/26-04-19T19-12_claude-给出的意见和代码更改patch.md"

我需要你：

1. 仔细理解这个 request，对比当前代码
2. 梳理 Claude 给出的 patch.md 确认他的方案是否都合适
3. 确认是否能应用这份更改

**应用 Patch**
NO: 不要手动调用 edit 一个个更改
可以：直接使用 `sspec tool patch` cli ，通过  `sspec tool patch --yes -f <file>` 一口气应用所有更改；在执行之前，首先使用 `--dry-run` 模式确认是否可行。



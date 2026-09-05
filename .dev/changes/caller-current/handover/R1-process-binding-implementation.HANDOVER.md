---
title: Process binding implementation handover
created: 2026-09-06T01:00:09+08:00
consumed: false
---

## Assume Reader

Fresh Pi Coding Agent continuing implementation in `H:/SrcCode/playground/siyuan-cli`. The reader can inspect the repository, the committed change artifacts, and the LAI store, but does not have this conversation's transient context.

## Background Context

The user wants to reduce workspace-selection friction for Agent and shell callers. Existing `--workspace` is per invocation, `.siyuan-cli.yaml` is directory-scoped, and `config.current` is machine-global. The agreed feature is **process binding**, not session identity or authentication: bind an existing named workspace to an observable long-lived OS process instance discovered from two independent child-call ancestry snapshots.

Authoritative requirements: `.dev/changes/caller-current/caller-current.DEV-SPEC.md`. Predicted implementation structure: `.dev/changes/caller-current/caller-current.SHAPE.md`. Existing workspace invariants: `src/workspace/workspace-resolution.SPEC.md`, `.dev/docs/error-model.md`.

## Current Status

Requirements and direction are closed; production implementation has not started. A responsibility-first code shape and LAI task tree are prepared. The next session should implement the first ready foundational task, not reopen the product naming or scope discussion unless implementation evidence changes an external guarantee.

## Trajectory

The initial investigation identified the missing scope between per-command flags, project files, and global config. A Windows spike in Pi showed independent shell calls sharing a stable `node.exe` ancestor. Codex and OpenCode showed the same general pattern, with Codex additionally proving that multiple logical Codex sessions can share one `codex.exe`; therefore the feature must not promise logical Agent/session isolation.

A Linux probe ran on `alistu` and verified `/proc/<pid>/stat` ancestry and `starttime_ticks`; independent SSH exec calls were deliberately recognized as a special remote topology, not as evidence about a normal Linux Agent runtime. The implementation contract remains Windows + Unix/Linux process observation, with runtime-specific behavior treated as observable process topology.

The command model was separated into `workspace` catalog/connection operations and a new top-level `current` selection surface. The agreed commands are `current bind`, `current confirm`, `current unbind`, `current global`, `current which`, and `current verify`; `workspace verify <name|--all>` checks named connections. Project-file/process-binding disagreement fails early at bind, is rechecked at confirm, and remains guarded during business resolution.

## Key Information for the Successor

- Process identity is primarily PID + process-instance creation identity (Windows PID + creation time; Linux PID + `/proc` starttime when available). Process name, executable path, and normalized command-line signature are also needed as role/context metadata because Pi/Codex/OpenCode may share a `node`-like executable; raw command lines may contain secrets and must not be persisted or printed by default. `ppid` is ancestry relation; cwd is context, not identity.
- The process binding may be shared by multiple logical callers inside one OS process. Do not add a Windows/Linux process-name blacklist or infer session identity from names.
- `current bind <existing-name>` must reject a current project-file workspace mismatch before creating pending state. `current confirm <nonce>` must re-read project config and reject a mismatch introduced between calls.
- `--baseUrl` remains ad-hoc and bypasses binding/project selection. Workspace catalog commands must not be affected by current cwd or process binding. `workspaceDir` materialization and runtime workspace verification remain unchanged.
- Runtime binding state must not be written into `config.yaml`; keep catalog/global defaults separate from ephemeral process-binding state.
- CLI output is part of the contract: bind/confirm/failure results need executable next-step guidance in English. Existing repository rule says CLI internal docs and prompts are English.
- Do not introduce a broker, signed capability, runtime-specific `PI_SESSION_ID` adapter, cwd-based identity, automatic path/URL add, or `current project` writer in this change.
- If process start identity is unavailable on a platform, allow best-effort matching with reduced identity strength rather than excluding that platform; use process signature metadata as a supporting discriminator.
- The previous commit is `018d397` (`📝 docs(workspace): specify process binding direction`). The current working tree may contain the follow-up SPEC/shape/handover artifact changes; inspect `git status` before editing.

## LAI Task Tree

The project-local LAI store is initialized at `.git/local-agent-issues/issues.db`. Use LAI, not a parallel task list:

- `#1` parent: Implement process binding for current workspace selection.
- `#2` ready: Implement cross-platform process ancestry.
- `#3` blocked by #2: Implement process-binding state and protocol.
- `#4` blocked by #3: Integrate process binding into workspace resolution.
- `#5` blocked by #3 and #4: Add current command surface and verification split.
- `#6` blocked by #5: Update process-binding docs and Agent skill.
- `#7` blocked by #4 and #5: Verify integration and compare against code shape.

Start with:

```bash
lai info --json
lai take 2
lai show 2
```

When the task is complete, run its tests, add a concise LAI Note if findings matter, and close it with `lai close 2`. Do not leave a task marked working when handing off.

## File Reference Map

- `.dev/changes/caller-current/caller-current.DEV-SPEC.md` — closed product and behavior contract.
- `.dev/changes/caller-current/caller-current.SHAPE.md` — predicted files, responsibilities, dependency direction, alternatives, and deliberate cuts.
- `.dev/changes/caller-current/prototype/process-anchor-spike.py` — disposable cross-platform ancestry probe.
- `.dev/changes/caller-current/prototype/index.html` — behavior prototype for command wording and conflict timing.
- `.dev/changes/caller-current/prototype/spike/` — Pi/OpenCode/Codex evidence, including Codex sessions sharing PID 22608.
- `src/workspace/resolve.ts` — current selection and materialization boundary.
- `src/workspace/command.ts` — current catalog commands and legacy `use`/`which` behavior.
- `src/workspace/paths.ts` — config-directory ownership.
- `src/api/command.ts` and `src/tool/registry.ts` — business consumers of effective workspace resolution.
- `tests/workspace-resolver.test.ts` and `tests/cli-entry.test.ts` — existing testing style and integration entry points.

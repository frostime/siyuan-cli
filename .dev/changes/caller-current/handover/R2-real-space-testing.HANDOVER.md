---
title: Real-space testing and docs handover
created: 2026-09-06T15:10:00+08:00
consumed: false
---

## Assume Reader

Fresh Pi Coding Agent continuing `caller-current` in `h:/SrcCode/playground/siyuan-cli` on branch `feat/caller-current`. You can inspect the repository, the committed change artifacts, the git log, and the LAI store, but you do not have the implementation session's transient context. The prior handover (`handover/R1-process-binding-implementation.HANDOVER.md`) covers how requirements were closed; read it only if you need the requirement-side history.

## Background Context

The process-binding feature is implemented and verified. Contracts: `.dev/changes/caller-current/caller-current.DEV-SPEC.md` (product) and `caller-current.SHAPE.md` (structure). Implementation and real-space verification are done; what remains is bundled documentation/skill updates (LAI #6, deliberately deferred with suggestions in its notes) and product-level CLI verification (LAI #8).

## Current Status

- Branch `feat/caller-current`, 6 commits on top of `018d397`: `d2d7f1a` (checkpoint: SPEC/SHAPE contract revision), `a38e543` (#2 process ancestry), `f419679` (#3 binding state/protocol), `0c8deed` (#4 resolution integration), `c7d2b80` (#5 current command surface), `1613cdb` (#7 SPEC sync + prune). Working tree clean.
- `pnpm run typecheck` clean, 171/171 tests pass, `pnpm run build` OK.
- LAI: #2–#5 and #7 closed with notes; #6 open (doc/skill suggestions in notes, do not close without user); #8 open (product-level CLI test checklist — the next execution target); parent #1 stays open until #6 and #8 close.
- A first real-space E2E against the dev workspace already succeeded once (recorded in the note on #7): bind → confirm anchored on the Pi agent process, `api system.version` resolved without `--workspace`, verify ok, unbind clean. #8 asks for a full systematic pass, including scenarios not yet exercised live.

## Trajectory

**Decision path.** The session started from R1 with #2 (process ancestry) ready. A native-FFI route (koffi) was spiked in `tmp/`, the user challenged the scope expansion, and the peer session (S984) decided via mail: keep the package JS-only; Windows capture = one `powershell.exe` CIM query spawned by argv; no deprecated wmic/tasklist as identity source. S984 then relayed user corrections that were folded into the SPEC: process nodes also carry executable path + command-line signature (raw command lines never persisted/printed), missing start identity degrades matching strength instead of failing the platform, and macOS stays in scope best-effort.

**Implementation.** #2 delivered `src/workspace/process-tree.ts` (injectable `ProcessTreeHost`, pure matching/LCA, per-platform adapters). #3 delivered `src/workspace/process-binding.ts` (pending probes with one-time nonce, atomic self-healing state files, nearest-common-ancestor confirm that never anchors on the machine root, scope-replacing writes). #4 integrated binding into `resolveEffectiveWorkspace` with the project-file-vs-binding agreement rule. #5 added the `current` command surface and the workspace verify split with deprecated `use`/`which` aliases. #7 pruned construction-era comments (`.dev/changes` references) and synced `src/workspace/workspace-resolution.SPEC.md`.

**Real-space verification.** The dev-space E2E succeeded via direct CLI invocation. It also exposed an environment limitation: under MSYS/Git Bash, `pnpm run` script wrappers break Windows ancestry capture (details below). The failure is explicit and contract-correct; direct invocation works end to end.

## Key Information for the Successor

**Design invariants that must survive any rework:**

- Strong instance matching = PID + platform start identity (`startId`); without a start identity on either side, degraded matching = PID + command signature; bare PID never matches, and a mismatching startId means PID reuse and never matches.
- Confirm never anchors on the machine root: if the LCA is the terminal node of both chains, binding fails (`PROCESS_BINDING_NO_COMMON_ANCESTOR`).
- A new binding replaces all records anchored inside the confirm-time ancestry, so resolution never arbitrates between two matches.
- Raw command lines never leave the capture layer: nodes carry `commandSignature` (sha256) + redacted `commandSummary` only.
- The confirm command re-checks the project file between reading the pending probe and consuming it (`getPendingProbe` → project check → `confirmPendingProbe`).
- `IMPLICIT_WORKSPACE` policy keys off `source === 'global-current'` in `src/api/guard.ts`; `process-binding` is explicit by construction — do not add special-casing.
- Resolution consumes `findActiveBinding()` only; business commands must not read binding state directly.
- `config.yaml` stays a catalog file; binding state lives under `<configDir>/process-binding/{pending,bindings}/`.

**Environment limitation (documented, not a bug):** under MSYS/Git Bash, `pnpm run` wraps the CLI in MSYS fork layers (`bash → sh.exe fork stub → pnpm node → cmd → node`). MSYS fork children have Win32 ppids pointing to transient fork-helper processes that are absent from `Win32_Process` (WMI even returns duplicate `node.exe`/`sh.exe` records for the same pid). Ancestry truncates at that layer, so bind/confirm fail explicitly with `PROCESS_BINDING_NO_COMMON_ANCESTOR`. Direct invocation (`node bin/siyuan.mjs` or the installed `siyuan` binary) keeps an intact Windows tree and works. Docs guidance for #6: binding flows should invoke the CLI binary directly; fallback advice is `--workspace` / project file, which the error hint already states.

**Manual CLI testing caveats:**

- `bin/siyuan.mjs` runs `dist/` — run `pnpm run build` after any code change before manual testing.
- Use ONLY the `dev` workspace. `local` is the user's main space; never run `workspace verify --all`.
- `config.current` is `local`; restore it with `current global local` if a scenario changes it.
- Read-only kernel calls only; write-like calls trigger the approval broker and need a human present.

## Product-level CLI test checklist

Authoritative checklist lives in LAI #8 (`lai show 8`) and must be executed from there; summary:

- **A. Happy path (dev space):** verify dev → bind → confirm from an independent call → which shows `process-binding` → `api system.version` + a read-only tool without `--workspace` → `current verify` → unbind → falls back to `project-file`; spot-check stdout/stderr/exit-code contract.
- **B. Isolation and staleness:** `current which` from a scope without the anchor (separate terminal) must not resolve the binding; bind + confirm from a plain terminal, close it, confirm the binding dies with the anchor.
- **C. Project-file conflicts:** mismatching temp-dir project file → bind exits 2 with no pending; project file changed between bind and confirm → confirm exits 2 with pending retained; business call in a conflicting dir fails, with `--workspace` it proceeds; agreeing pair (the repo itself) works.
- **D. Error surface:** bind nonexistent → `WORKSPACE_NOT_FOUND`; confirm garbage nonce → `PENDING_NOT_FOUND`; `current verify <name>` and bare `workspace verify` → `VERIFY_MODE_CONFLICT`; optional live nonce-expiry check.
- **E. Deprecated aliases:** `workspace use` / `workspace which` run with stderr `DEPRECATED`; restore `config.current` (`local`) afterwards.
- **F. MSYS/pnpm demo:** the wrapped-call failure from the limitation above — expected explicit error, then unbind cleanup.
- **G. Human-present items (defer):** `IMPLICIT_WORKSPACE` + approval-broker flow with `global-current` selection and a write-like call.

Record results in a Note on #8; fix or file deviations; restore all state when done.

## File Reference Map

- `.dev/changes/caller-current/caller-current.DEV-SPEC.md` — product contract (incl. CLI output wording).
- `.dev/changes/caller-current/caller-current.SHAPE.md` — structural shape and deliberate cuts.
- `.dev/changes/caller-current/handover/R1-process-binding-implementation.HANDOVER.md` — requirements history.
- `src/workspace/workspace-resolution.SPEC.md` — module contract, updated for the binding step.
- `src/workspace/process-tree.ts`, `src/workspace/process-binding.ts`, `src/workspace/resolve.ts`, `src/workspace/paths.ts` — capture, protocol, selection, state dir.
- `src/current/command.ts` — command surface; exports `runCurrentGlobal` / `runCurrentWhich` for the deprecated aliases.
- `src/workspace/command.ts` — catalog commands, deprecated aliases, verify split.
- `tests/process-tree.test.ts`, `tests/process-binding.test.ts`, `tests/workspace-selection.test.ts`, `tests/current-command.test.ts` — fixture, protocol, selection, and CLI integration coverage.
- LAI #6 (docs/skill suggestions), #8 (product test checklist), #7 note (real-space E2E record + MSYS limitation), #1 (parent).

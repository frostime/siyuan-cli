---
status: draft
---

# Process Binding Code Shape

## Purpose and recommended organization

This change adds a caller-local workspace selection without changing the workspace catalog or the Kernel connection materialization contract. The code should be organized by responsibility rather than by the visible command sequence:

```text
process-tree adapter
  → process-binding state/protocol
      → effective workspace selection
          → current command, api command, tool command
```

The important boundary is that `api` and `tool` must consume the same effective selection result as `current which` and `current verify`. They must not read binding state directly.

The existing `workspace` module remains responsible for the global workspace catalog and named-workspace connectivity. A new `current` command surface owns selection operations. Process binding is a workspace-resolution capability, not a permission or authentication subsystem.

## Predicted diff

```text
src/
├── cli.ts                         modify  +5–10/-0–2
│   └── register the new top-level `current` command.
├── current/
│   └── command.ts                 create  +180–280
│       └── `bind`, `confirm`, `unbind`, `global`, `which`, `verify`; owns CLI
│           argument parsing, prompts, JSON result shaping, and compatibility-free
│           current operations. It delegates selection and binding mechanics.
├── workspace/
│   ├── process-tree.ts             create  +140–240
│   │   └── platform-neutral process node/identity model and Windows/Unix
│   │       ancestry capture; hides Toolhelp and `/proc` details.
│   ├── process-binding.ts          create  +180–300
│   │   └── pending probe and binding lifecycle, nonce pairing, process identity
│   │       matching, state-file I/O, and stale-binding handling.
│   ├── paths.ts                    modify  +10–25/-0–5
│   │   └── owns the process-binding state directory derived from the existing
│   │       config-directory rules.
│   ├── resolve.ts                  modify  +80–140/-25–60
│   │   └── integrates process binding into effective selection and reports its
│   │       provenance/diagnostics; keeps catalog resolution and materialization
│   │       separate.
│   ├── command.ts                  modify  +80–140/-50–100
│   │   └── keeps catalog commands; moves/aliases old selection commands and
│   │       separates named-workspace verify from current verify.
│   └── config.ts                   modify  +0–15/-0–5
│       └── only re-exports new resolution symbols if the public compatibility
│           surface requires it; no process state is added to config.yaml.
├── api/
│   ├── command.ts                  modify  +5–20/-0–10
│   │   └── consumes the expanded resolved-workspace provenance without direct
│   │       process-binding access.
│   └── guard.ts                    modify  +5–20/-5–15
│       └── recognizes process-binding as explicit for warning behavior and
│           exposes any required binding diagnostics.
└── tool/
    └── registry.ts                 modify  +5–15/-0–10
        └── continues using the shared effective workspace resolver.

tests/
├── process-tree.test.ts            create  +120–220
│   └── pure ancestry/LCA and identity behavior with injected snapshots; platform
│       adapter smoke coverage where the host permits it.
├── process-binding.test.ts         create  +180–300
│   └── pending/confirmed/stale/invalid state, nonce pairing, and atomic state
│       behavior using temporary config roots and fake process trees.
├── workspace-selection.test.ts     create  +180–280
│   └── precedence, project conflict, process-binding provenance, and fallback.
├── current-command.test.ts         create  +140–240
│       └── structured stdout/stderr, command transitions, and compatibility aliases.
└── workspace-resolver.test.ts      modify  +10–40/-0–10
    └── preserve existing workspaceDir materialization behavior while adding only
        affected selection assertions.

docs / bundled agent guidance
├── src/docs/cli-usage/cli-overview.md       modify  +30–70/-10–30
├── src/docs/cli-usage/workspace-config.md   modify  +20–50/-5–20
├── src/docs/recipes/connect-workspace.md    modify  +30–70/-10–30
└── skills/siyuan-cli/SKILL.md               modify  +20–50/-5–20
    └── teach `current` and process-binding boundaries; retain explicit fallback
        guidance for shared process scopes.
```

The ranges are structural estimates, not budgets. If implementation requires a broker, runtime-specific adapters, or process-name policy tables, that is a material shape change and must be explained before proceeding.

## Ownership and dependency shifts

- **Selection ownership** shifts from the implicit combination of `workspace/resolve.ts` and `workspace/command.ts` to a shared selection path in `workspace/resolve.ts`, consumed by the new `current` command and existing business commands.
- **Process observation** belongs only to `workspace/process-tree.ts`; resolver and command code should not know Windows Toolhelp, Linux `/proc`, PID reuse, or parent traversal details.
- **Binding state** belongs only to `workspace/process-binding.ts`; `config.yaml` remains a catalog/global-default file and must not become a runtime binding store.
- **CLI protocol** belongs to `current/command.ts`; it should not implement LCA or state-file rules inline.
- **Materialization** remains in `workspace/resolver.ts` and `materializeWorkspace()`. Process binding selects a named workspace; it does not create a URL or bypass `workspaceDir` verification.
- **Permission behavior** remains in the existing permission/guard layers. Process binding is explicit selection provenance, not authorization.

## Candidate decomposition considered

### Command-first
Put process probing, pending state, and resolution changes directly into a large `current/command.ts`.

Rejected: it makes the two-step state machine and platform behavior invisible to the resolver, encourages `api`/`tool` drift, and makes pure testing difficult.

### Responsibility-first (recommended)
Separate process observation, binding state, shared resolution, and command presentation as above.

Chosen: it hides the platform/state complexity behind two meaningful interfaces while keeping the diff shallow at the existing `api`/`tool` consumers.

## Deliberate cuts

- No broker, socket, signed capability, or runtime-specific session adapter.
- No cwd in the process identity key; it may be retained only as diagnostic context.
- No process-name blacklist as the correctness mechanism.
- No automatic add of a path/URL during bind.
- No `current project` writer in this change.
- No promise of logical Agent/session isolation when multiple logical callers share one OS process.

## Boundary to re-check during implementation

The process-binding mechanism must be described and implemented as binding to an observable OS process instance. If the implementer discovers that the selected process cannot be matched reliably after a new CLI invocation, or that a proposed fallback requires identifying logical sessions inside one OS process, stop and return to the SPEC rather than adding heuristics.

---
status: accepted
updated: 2026-09-08
---

# Process Binding Reliability — Predicted Change Shape

## Decision summary

Organize the change by **responsibility first**, then isolate the one platform path whose observation mechanics are materially different.

- `workspace/binding/` owns process-instance modeling, observation, persisted binding state, and the two-call protocol.
- Platform observation is hidden behind one binding-specific observer contract. Windows owns the native snapshot and conditionally composes an MSYS logical segment; MSYS is not a project-wide platform plugin.
- Binding protocol code receives observation results and never invokes PowerShell, `ps`, `/proc`, or macOS `ps` directly.
- Workspace resolution consumes a deep binding operation: match, conclusive no-match, or a domain error for insufficient evidence. It does not interpret platform stop reasons.
- `current` remains a CLI namespace but its command implementation moves into the workspace domain.
- Deprecated `workspace use` and `workspace which` call workspace/config resolution operations directly. They do not call another command module, and their small legacy adapters do not justify a new service layer.

This keeps the difficult knowledge in two places: platform evidence construction in observation modules, and state/lifecycle policy in the protocol. It does not create a generic evidence graph, platform registry, identity service, or command-service framework.

## Design pressures and invariants

### Pressures

1. A process chain is not just an array. Callers must know whether traversal reached a trustworthy boundary or stopped because evidence disappeared.
2. Windows native ancestry and MSYS logical ancestry are different relations. Their composition must be local to Windows observation rather than leaking into protocol or resolution.
3. Binding lifecycle is growing: retryable confirm, targeted cancellation, confirmed-only unbind, stale-instance reclamation, and recovery-rich errors.
4. Every implicit business invocation must avoid both silent fallback and unnecessary process capture.
5. N4 observation work and N5 lifecycle/command work need a stable semantic boundary, even if implementation is performed sequentially.
6. Future maintainers need one debugging path from persisted record → instance inspection → ancestry observation → binding decision → workspace resolution.

### Invariants

- Keep the public `current` and `workspace` CLI namespaces and existing selection precedence.
- Preserve `--baseUrl`, `--workspace`, and `SIYUAN_CLI_WORKSPACE` short-circuit behavior.
- Preserve state under `<config>/process-binding/{pending,bindings}` and keep confirmed-record JSON compatible.
- Preserve process-instance matching: PID + start identity, degrading to PID + matching command signature; never bare PID.
- Preserve the existing stderr JSON and exit-code model. Only success presentation gains compact/JSON handling through the existing shared output utility.
- Do not send a SiYuan request after fatal binding uncertainty.
- Do not let binding code own catalog entries, credentials, permissions, project overlays, or connection materialization.
- Do not hard-reject an environment merely because it was not tested; fail only when required capability or evidence is unavailable.

## Current architecture diagnosis

The current implementation has three useful boundaries, but each erases knowledge needed by this change:

- `src/workspace/process-tree.ts` combines pure identity algorithms, sensitive command normalization, host I/O, and all platform capture in one 554-line module. Adding MSYS parsing and hybrid composition here would make every platform change require understanding the entire file.
- `src/workspace/process-binding.ts` combines filesystem persistence, pending/confirmed lifecycle, process observation, and active lookup. It receives only `chain`, so it cannot distinguish conclusive no-match from a truncated observation.
- `src/current/command.ts` performs command parsing, workspace/project validation, binding orchestration, network verification, and fixed JSON presentation. `src/workspace/command.ts` imports its exported command runners for deprecated aliases, reversing the intended dependency toward a CLI adapter.

The most important leaked decision is **observation sufficiency**. The platform layer currently discards why a walk stopped, while protocol and resolver code behave as though every returned chain were complete.

## Alternatives considered

### A. Responsibility-first binding subsystem — recommended

```text
binding protocol/state → observer contract → platform evidence
workspace resolver     → binding protocol
CLI commands           → workspace and binding operations
```

This groups code by what changes together: protocol changes do not touch platform capture, and a Git/MSYS parsing change does not touch workspace selection. It creates one explicit semantic seam between N4 and N5.

Trade-off: the old two-file implementation becomes several focused files, and maintainers must follow one additional internal hop. Each new boundary hides a real decision: persisted representation, process semantics, platform capture, or lifecycle.

### B. One vertical module per platform

Each Windows/Linux/macOS module would own capture, matching, and binding behavior for that platform.

Rejected because retry, cancellation, stale cleanup, persistence, output state, and workspace fallback are platform-independent product rules. Vertical slices would duplicate those rules and make future lifecycle changes touch every platform.

### C. Generic multi-signal evidence graph

Model ancestry, MSYS edges, pipe peers, process names, and future signals as pluggable evidence nodes and confidence rules.

Rejected because only ancestry plus one conditional Windows bridge is required and verified. A generic graph would broaden identity semantics, combinations, debugging states, and tests before a second accepted signal exists. Pipe-peer evidence remains conditional work in `graph.yaml`.

## Target modules and dependency direction

```text
src/workspace/current-command.ts
        │
        ├── workspace config/project/resolve/materialize
        └── binding/protocol.ts
                  │
                  ├── binding/state.ts
                  ├── binding/process-tree.ts
                  └── binding/observation.ts
                            │
                            └── binding/windows/capture.ts
                                      └── binding/windows/msys-process-table.ts

src/workspace/resolve.ts ──→ binding/protocol.ts
src/workspace/command.ts ──→ workspace config/resolve (legacy aliases only)
```

There is no reverse import from `workspace/command.ts` into `current-command.ts`, and no binding module imports a command module.

### `binding/process-tree.ts` — process semantics

Owns the canonical `ProcessNode`, process identity matching, nearest-common-ancestor selection, command-line hashing/redaction, and the observation termination model. It has no filesystem or child-process I/O.

An ancestry observation carries an ordered self-first chain plus a termination reason. The minimum reasons are:

- reached a trustworthy root/boundary;
- parent disappeared;
- cycle or depth limit;
- MSYS table or handoff became inconsistent.

Capture-command failure or an unverifiable output format is an exception, not a plausible empty observation.

### `binding/observation.ts` — binding-specific observation facade

Owns `ProcessObserver`, default host I/O, platform dispatch, and the existing Linux/macOS adapters. Protocol code depends on this interface rather than `ProcessTreeHost` or platform commands.

The observer offers two semantic operations:

1. capture current ancestry for bind/confirm;
2. inspect recorded anchors and the current scope in one observation session for lookup/unbind.

The second operation returns per-anchor `live`, `stale`, or `unknown` inspection plus ancestry when retained records still require scope matching. This lets Windows reuse one native snapshot for instance inspection and ancestry rather than performing two CIM scans per business call. When every record is conclusively stale, it need not invoke MSYS or construct caller ancestry.

Tests inject a fake `ProcessObserver`. Adapter tests continue to inject host I/O below the observer boundary.

### `binding/windows/capture.ts` — native snapshot and conditional hybrid path

Owns one normalized Windows process snapshot, native parent traversal, authoritative creation-time conversion, process-instance inspection, and hybrid-chain composition.

It asks `msys-process-table.ts` for an MSYS table from the PATH-selected `ps`. The MSYS branch is used only when that table contains the current CLI WINPID. If not, the native Windows observation remains the result; no product/process-name heuristic activates the branch.

Every persisted or compared node in the hybrid chain uses Windows PID and Windows-derived identity fields. MSYS PID exists only while constructing relation order.

### `binding/windows/msys-process-table.ts` — one narrow external format

Owns execution and validation of `ps -e -l`, a wide/unset `COLUMNS`, header-driven parsing, current-WINPID membership, logical-parent walking, and detection of malformed, cyclic, defunct, or incomplete rows.

It returns MSYS relation data to `windows/capture.ts`; it does not create binding identities, persist records, choose a workspace, or know CLI product names. Git for Windows Bash and standalone MSYS2 use this same capability contract, so no `git-bash.ts` brand-specific branch is created. No reusable “Unix emulation provider” interface is introduced.

### `binding/state.ts` — persisted representation

Owns state paths below `getProcessBindingDir()`, atomic JSON writes, enumeration, shape validation, and deletion. It exposes module functions rather than a repository class or generic store interface.

Lifecycle policy stays out of this file. `state.ts` can report malformed records, while `protocol.ts` decides expiry, retry, reclamation, replacement, cancellation, and unbinding.

Compatibility rules:

- confirmed binding records keep their current shape and filenames;
- pending records retain the existing `chain` and add optional termination metadata;
- a pre-change pending record with no termination metadata may still confirm if a reliable common anchor is observed, but no-match from that record is treated as insufficient;
- malformed records retain the existing self-healing behavior.

### `binding/protocol.ts` — the deep binding API

Owns pending TTL, bind/confirm pairing, same-nonce retry, targeted cancel, confirmed-only unbind, replacement of an existing scope binding, conservative stale reclamation, and domain-level recovery errors.

Its main external behavior remains compact:

- create a pending probe;
- read/confirm a pending probe;
- cancel one pending nonce without observation;
- unbind confirmed records in the current scope;
- find the active binding, returning a match or conclusive absence and throwing on insufficient evidence.

`findActiveBinding()` first loads and inspects confirmed records. Conclusively stale records are deleted; unknown records remain. With no retained record it returns absence without caller capture. With retained records it returns the nearest reliable match, returns absence only when evidence is sufficient, and otherwise raises a structured binding-observation error with `requestSent: false` and an explicit-workspace recovery.

Bind/confirm may succeed when a reliable common anchor is present before an incomplete tail. A missing common anchor plus incomplete evidence remains retryable while the nonce is valid.

### Command and resolver ownership

`src/workspace/current-command.ts` owns only CLI argument definitions, compact renderers, JSON-envelope selection, and orchestration across workspace/binding operations. It adds `cancel <nonce>` and uses `preparePrintedOutput()`; it does not create a second output framework.

`src/workspace/resolve.ts` preserves precedence. It continues to call the binding facade only after explicit selectors. Platform failures arrive as binding-domain errors; resolver code never checks Windows/MSYS stop reasons.

Deprecated aliases are intentionally asymmetric:

- `workspace use` performs its small config mutation through existing config load/save operations;
- `workspace which` calls `resolveEffectiveWorkspace()` directly and preserves its legacy warning/JSON output.

Duplicating a small deprecated adapter is cheaper and safer than introducing a permanent `CurrentService` solely to share command presentation.

## Predicted diff

Magnitudes are structural estimates, not budgets. “Moved” lines are counted at their destination even when their logic is preserved.

```text
src/
├── cli.ts                                      modify  +1–3/-1–3       current command import path only
├── current/
│   └── command.ts                              delete  -374            shallow source domain removed
└── workspace/
    ├── current-command.ts                      create  +430–520        moved command surface; compact/JSON, retry recovery, cancel
    ├── command.ts                              modify  +20–45/-5–15    remove command dependency; local deprecated adapters
    ├── resolve.ts                              modify  +15–35/-5–15    consume fail-loud binding facade; preserve precedence
    ├── process-binding.ts                      delete  -365            responsibilities move to binding/state + protocol
    ├── process-tree.ts                         delete  -554            responsibilities move to binding process/observer/adapters
    ├── workspace-resolution.SPEC.md            modify  +15–30/-5–15    durable selection and uncertainty contract
    └── binding/
        ├── process-tree.ts                     create  +150–230        pure model, identity, termination, matching/redaction
        ├── observation.ts                      create  +180–260        observer contract, host, dispatch, Linux/macOS capture
        ├── windows/
        │   ├── capture.ts                      create  +230–340        CIM snapshot, native walk, inspection, hybrid composition
        │   └── msys-process-table.ts           create  +150–230        ps invocation, capability check, parser, logical walk
        ├── state.ts                            create  +110–170        atomic persisted-state mechanics
        └── protocol.ts                         create  +280–390        lifecycle, reclamation, active lookup, domain errors

tests/
├── process-tree.test.ts                        modify  ~40–60%          pure identity/termination plus retained Linux/macOS cases
├── windows-process-tree.test.ts                create  +220–320        native truncation, hybrid handoff, snapshot identity
├── msys-process-table.test.ts                  create  +160–240        3.4/3.6 formats, columns, status/defunct, ownership failures
├── process-binding.test.ts                     modify  +180–280/-30–80 retry/cancel/unbind/reclamation/insufficient behavior
├── workspace-selection.test.ts                 modify  +100–170        bypass, no-record skip, match/no-match/insufficient integration
└── current-command.test.ts                     modify  +140–220/-20–50 compact/JSON states, recovery text, aliases

skills/siyuan-cli/
├── SKILL.md                                    modify  +3–8/-3–8       top-level routing/recovery wording
├── cli-usage/current.md                        modify  ~35–50%          final protocol, outputs, failures, tested environments
└── recipes/connect-workspace.md                modify  +5–15/-3–10     corrected bind/cancel/unbind workflow

README.md                                       modify  +5–15/-3–10     concise public workflow only
.dev/docs/process-binding.md                    create  +180–280        durable technical basis and evidence after N7
.dev/docs/error-model.md                        modify  +1–5/-0–3        process-binding uncertainty error family
.dev/project.md                                 modify  +1–3             Docs Index entry
```

`src/shared/output.ts`, `src/shared/errors.ts`, workspace credentials/permission modules, and generic platform infrastructure are not expected to change. If implementation requires a new project-wide output or error abstraction, that is a material SHAPE deviation.

## Control flow

### Implicit business resolution

```text
explicit baseUrl/workspace/env? ── yes → existing explicit resolution
              │ no
              v
load confirmed records
              v
observe recorded instances once
     ├─ all stale → delete → project/global resolution (no ancestry/MSYS work)
     └─ live/unknown remain
              v
construct current ancestry
     ├─ nearest record matches → process-binding workspace
     ├─ sufficient no-match    → project/global resolution
     └─ insufficient           → structured non-zero error; no SiYuan request
```

### Bind and confirm

```text
bind → validate catalog/project agreement → capture observation → persist pending
confirm → read unexpired pending → revalidate project agreement → capture observation
        ├─ reliable common anchor → replace scope binding → consume pending
        └─ no reliable decision   → retain pending until original expiry; return retry/cancel recovery
```

### Cancel and unbind

```text
cancel <nonce> → delete that pending record only; no process observation
unbind         → inspect confirmed records/current scope; delete matching confirmed only
```

## Migration and implementation ownership

1. N4 creates the process model/observer/adapters and focused fixtures alongside the old implementation. No binding lifecycle or CLI behavior changes in that step.
2. N5 moves persisted state and protocol into `binding/`, moves the current command, adds cancel and output behavior, and removes old source files after callers migrate. It consumes the observer contract fixed here.
3. N6 switches effective resolution to the new active-binding semantics and adds cross-module behavior tests.
4. N7 runs full automated and real-runtime verification. A structural mismatch returns to this SHAPE rather than expanding silently.
5. N9 writes the durable developer document from final code and accepted evidence; N8 then finalizes user guidance and Change artifacts.

N4 and N5 are logically independent behind `ProcessObserver`, but they need not be executed concurrently. Sequential integration is preferred unless separate worktrees provide enough value to justify merge coordination.

## Debugging and observability

- Observation failures retain platform, command stage, termination reason, and handoff stage without exposing raw command lines.
- Binding-domain errors report whether confirmed and pending state remain, whether retry/cancel is available, and `requestSent: false` when resolution stopped before networking.
- Persisted records remain inspectable JSON under the existing config path.
- `current which --print json` exposes binding provenance; compact output emphasizes the selected workspace and next action rather than dumping process tables.
- Raw MSYS tables and command lines are never persisted or printed by normal commands.

## Deliberate non-goals

- No pipe-endpoint PID signal unless graph candidate C1 activates.
- No generic evidence/confidence graph.
- No platform plugin registry or public observer extension API.
- No logical Agent identity guarantee when callers share one anchor.
- No process-event daemon, ETW listener, broker, or harness integration.
- No confirmed-binding wall-clock TTL.
- No redesign of project-wide output or error contracts.
- No broad workspace-directory reorganization.
- No abstraction created solely to remove a few lines from deprecated aliases.

## Acceptance requested

Before implementation, confirm these linked decisions as one shape:

1. responsibility-first `binding/` decomposition with a narrow conditional Windows→MSYS dependency;
2. one binding-specific observer contract separating N4 from N5;
3. separate persisted-state mechanics and lifecycle policy;
4. resolver consumes domain match/absence/error semantics, never platform stop reasons;
5. current command moves into workspace while deprecated aliases use existing domain/config operations locally;
6. compatible state migration and sequential implementation path described above.

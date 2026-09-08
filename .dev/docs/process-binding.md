---
name: process-binding
description: "Maintainer model for caller-process workspace binding: algorithm, module contracts, platform observation, evidence, and revalidation."
updated: 2026-09-08
scope:
  - /src/workspace/binding/**
  - /src/workspace/resolve.ts
  - /src/workspace/current-command.ts
  - /tests/process-binding.test.ts
  - /tests/process-tree.test.ts
  - /tests/windows-process-tree.test.ts
  - /tests/msys-process-table.test.ts
  - /tests/workspace-selection.test.ts
deprecated: false
replacement: ""
---

# Process Binding

Read this document when changing process observation, binding identity or lifecycle, workspace-resolution integration, runtime support, or related failure handling. It records cross-file contracts and external constraints that cannot be recovered safely from one source file. Command usage belongs in `skills/siyuan-cli/cli-usage/current.md`.

## System model

Process binding maps a named workspace to an observable OS process scope. It does not identify a logical Agent or application session. Logical callers that share the selected process instance share its binding.

> **Known topology limitation:** CLI harnesses such as Pi, Codex CLI, and OpenCode have been validated with distinguishable long-lived process scopes. Integrated GUI harnesses may multiplex sessions into one host process. In the observed Codex App topology, different agent sessions ultimately reach the same Codex App process, so binding is app-wide rather than session-scoped. Use a project file or explicit `--workspace` when those sessions require isolation.

### Two-observation anchor selection

Each CLI invocation is short-lived. One invocation cannot distinguish its intended long-lived caller from transient wrappers in its own ancestry, so confirmation compares two independent observations.

```text
bind observation A:     CLI-A → wrapper-A → scope-X → outer processes
confirm observation B:  CLI-B → wrapper-B → scope-X → outer processes
                                           ↑
                         nearest reliably identified common instance
```

`src/workspace/binding/process-tree.ts → findNearestCommonAncestor()` walks observation A from self outward. The first node that reliably identifies the same process instance in observation B becomes the anchor. Consequently:

- the anchor is nearest from the bind caller's perspective;
- bind and confirm must be different CLI processes;
- the machine root is not a useful caller scope and is rejected;
- a reliable common anchor found before a truncated tail is valid;
- the anchor's lifetime defines the binding lifetime.

Two CLI processes launched sequentially by one shell are independent calls. If that shell is disposable, it can still be the nearest common anchor and the binding will correctly become stale when it exits. Do not combine bind and confirm inside a short-lived wrapper when the intended scope is an outer caller.

### Active-binding lookup

A later invocation does not repeat the two-observation protocol. It inspects confirmed anchors and compares retained records with its current ancestry:

```text
load confirmed records
        ↓
inspect anchor instances
        ├─ stale   → delete
        ├─ live    → retain
        └─ unknown → retain
        ↓
no retained records? ── yes → return no binding without caller observation
        │ no
        ↓
capture current ancestry
        ├─ nearest reliable anchor match → return binding
        ├─ complete, conclusive no-match → return no binding
        └─ incomplete or unresolved      → fail before any SiYuan request
```

This ordering is important: stale cleanup happens before scope matching, and process ancestry is not captured when no confirmed record can affect selection.

### Workspace-selection boundary

Process binding participates only in implicit named-workspace selection:

```text
--baseUrl
  → --workspace
  → SIYUAN_CLI_WORKSPACE
  → project workspace / process binding
  → config.current
```

`--baseUrl`, `--workspace`, and `SIYUAN_CLI_WORKSPACE` return before binding state or process observation is consulted. A project workspace and process binding may coexist only when they select the same name. `src/workspace/resolve.ts` consumes binding-domain outcomes; it never interprets platform-specific stop reasons.

## Responsibilities and dependencies

```text
current-command.ts ─┬→ resolve.ts ─────→ binding/protocol.ts
                    └──────────────────→ binding/protocol.ts
                                             ├→ binding/state.ts
                                             ├→ binding/process-tree.ts
                                             └→ binding/observation.ts
                                                        └→ binding/windows/capture.ts
                                                                   └→ windows/msys-process-table.ts
```

| Owner | Responsibility | Primary verification |
|---|---|---|
| `binding/process-tree.ts` | Canonical process instance, identity comparison, ancestry termination, nearest common anchor, command redaction | `tests/process-tree.test.ts` |
| `binding/observation.ts` | `ProcessObserver`, host I/O, platform dispatch, Linux and macOS capture | `tests/process-tree.test.ts` |
| `binding/windows/capture.ts` | One Windows process snapshot, native ancestry, anchor inspection, optional MSYS composition | `tests/windows-process-tree.test.ts` |
| `binding/windows/msys-process-table.ts` | `ps -e -l` execution, header parsing, ownership check, logical walk | `tests/msys-process-table.test.ts` |
| `binding/state.ts` | Validated pending/confirmed JSON I/O and atomic file replacement | `tests/process-binding.test.ts` |
| `binding/protocol.ts` | Bind, confirm, retry, cancel, unbind, reclamation, active lookup, recovery errors | `tests/process-binding.test.ts` |
| `resolve.ts` | Selection precedence, project/binding agreement, binding provenance | `tests/workspace-selection.test.ts` |
| `current-command.ts` | CLI arguments and compact/JSON presentation | `tests/current-command.test.ts` |

Platform observation must not choose workspaces or mutate binding state. Protocol code must not invoke PowerShell, `ps`, or `/proc` directly. Resolver code must not branch on Windows, MSYS, Linux, or macOS evidence.

## Stable contracts

### Process-instance identity

A `ProcessNode` persists native PID and safe identity metadata, never a logical MSYS PID or raw command line.

| Evidence | Interpretation |
|---|---|
| Same PID and equal authoritative start ID | `pid+start` match |
| Same PID and different authoritative start ID | Conclusive PID reuse; stale record |
| A start ID is unavailable, but PID and command signature match | `pid+signature` degraded match |
| Same PID with incomplete or different non-authoritative evidence | Unknown, not a match and not proof of reuse |
| Different PID | No match |

Bare PID is never sufficient for a binding match. The same-PID guard used to reject bind and confirm inside one CLI process is a conservative protocol rejection, not an identity match.

### Ancestry and sufficiency

`ProcessAncestry` is a self-first chain plus an explicit termination:

| Termination | Meaning |
|---|---|
| `root` | Traversal reached a trustworthy root. |
| `parent-missing` | A creator exited before observation. |
| `cycle` / `depth-limit` | Traversal cannot continue safely. |
| `inconsistent` | Native, MSYS-table, or handoff evidence contradicts itself. |

Sufficiency depends on the operation:

| Situation | Result |
|---|---|
| Bind and confirm contain a reliable non-root common anchor | Confirm, even if a later tail is incomplete. |
| Bind/confirm have no usable common anchor and both observations are complete | Conclusive confirmation failure. |
| Bind/confirm have no common anchor and either observation is incomplete or legacy-unknown | Retryable insufficient observation; retain the nonce until its original expiry. |
| Active ancestry reliably contains a retained anchor | Match. |
| Active ancestry is complete and rules out every retained anchor | Conclusive no-match; continue selection. |
| Active ancestry is incomplete, or contains an anchor PID without enough identity evidence | Insufficient; fail before request and retain state. |

Capture-command failure or an unverifiable format is an error, not an empty observation.

### State lifecycle

State is stored outside human-edited `config.yaml`:

```text
<config>/process-binding/
├── pending/<nonce>.json
└── bindings/<anchor-derived-key>.json
```

| State | Lifetime and transitions |
|---|---|
| Pending | Fixed 15-minute TTL from original `createdAt`; failed confirm does not extend it; `cancel <nonce>` removes only that record without process observation. |
| Confirmed | No wall-clock TTL; replaced by a new binding in the same observed scope; removed by matching unbind or conclusive stale reclamation. |
| Invalid JSON/shape | Self-healed by deletion. |
| Existing but unreadable state | Retained and reported as unavailable; never treated as absence. |

`current unbind` removes confirmed bindings in the current scope and does not consume pending records. An unrelated unreadable pending record does not block a new bind because pending records do not participate in active selection.

### Failures and sensitive process data

Binding failures use the project error contract in `.dev/docs/error-model.md`. Relevant details state whether a binding exists, whether pending state remains and is retryable, exact recovery commands, and whether a SiYuan request was sent. Fatal implicit-selection uncertainty reports `requestSent: false` and recommends explicit `--workspace`.

Raw process command lines may contain tokens, prompts, and paths. Observation adapters may use them transiently, but persisted and returned nodes contain only:

- a SHA-256 signature used for degraded identity matching;
- a bounded, best-effort redacted summary used for diagnostics.

Normal output, state files, fixtures derived from real machines, and issue reports must not contain raw command lines or process tables. Platform stderr is represented only by a diagnostic hash when needed.

## Platform observation

Every platform adapter must implement the same `ProcessObserver` contract: capture current ancestry, inspect recorded instances as live/stale/unknown, preserve termination, and avoid caller capture when every anchor is conclusively stale.

| Platform path | Relation source | Start identity | Important boundary |
|---|---|---|---|
| Linux | `/proc/<pid>/stat` PPID | `/proc` kernel starttime | Missing process file can prove absence; unreadable/malformed evidence remains unknown. |
| macOS | `ps` PPID | `ps lstart` | Per-process query failure currently remains unknown rather than proving absence. |
| Windows native | One `Get-CimInstance Win32_Process` snapshot | `CreationDate` normalized to UTC .NET ticks | An exited creator's former parent is not recoverable from the current native table. |

### Optional MSYS ancestry augmentation on Windows

MSYS-family runtimes maintain a logical process relation that can remain useful after fork/exec behavior breaks the native Windows creator chain. This is an implementation of the Windows observer's “obtain ancestry” responsibility, not part of the binding algorithm.

```text
current Windows PID
      ↓
PATH-selected `ps -e -l`
      ↓ table contains current WINPID exactly once
MSYS PID/PPID logical walk
      ↓ map every row through WINPID
same Windows snapshot
      ↓ continue native walk above the outer MSYS process
canonical ProcessAncestry
```

`msys-process-table.ts` invokes `ps -e -l`, sets a wide `COLUMNS`, locates `PID`/`PPID`/`WINPID` by header, and rejects duplicate ownership, duplicate logical PIDs, cycles, defunct rows, missing parents, and malformed required columns.

The table is used only when it contains the current CLI WINPID. This distinguishes the owning Git for Windows or standalone MSYS2 runtime from another installation without relying on product or process names. Git Bash is therefore a tested MSYS-capability runtime, not a separate `git-bash` code path.

MSYS PID/PPID provides relation order only. Canonical and persisted nodes use Windows PID, Windows start ID, and Windows-derived signature. Do not apply Windows parent-before-child creation ordering to an MSYS logical edge: exec can preserve logical PID while replacing WINPID and Windows creation time.

If `ps` is absent, unverifiable, or foreign, the observer keeps the native Windows result. Optional-capability failure never turns a truncated native chain into a complete no-match.

## Evidence and verification boundary

### Claims and evidence

| Claim | Evidence |
|---|---|
| Windows native ancestry can stop at an exited creator. | Real Windows process snapshots summarized in the technical report; `tests/windows-process-tree.test.ts`. |
| MSYS logical ancestry can recover the relation to a long-lived caller. | Independent real Pi/MSYS2 and Git-for-Windows CLI-shaped calls; hybrid fixtures. |
| The correct MSYS installation can be selected without a product whitelist. | Real Git→MSYS2 and MSYS2→Git current-WINPID rejection tests; parser fixtures for `ps` 3.4 and 3.6. |
| Start identity prevents PID-reuse matches and enables stale cleanup. | Independent CIM start-ID comparison; process identity, lifecycle, and resolver tests. |
| Truncated ancestry with a retained unresolved binding fails before networking. | Real Pi/MSYS2 `api system.version` failure with retained isolated state and `requestSent: false`; resolver fixtures. |
| Explicit selectors bypass process observation. | Real isolated-config invocations with an uncertain binding; workspace-selection tests. |
| Retry, cancel, unbind, expiry, malformed state, and unreadable state follow their contracts. | Protocol and CLI tests plus isolated real-runtime lifecycle runs. |

The detailed investigation and external-source trail are in `.dev/changes/process-binding-reliability/process-binding-reliability.TECH-REPORT.md`. That report owns experimental detail; this document owns the current model and maintenance consequences.

### Tested runtime topologies

| Runtime or harness | Verified result |
|---|---|
| Pi CLI on Windows/MSYS2 | Distinct CLI calls reach one long-lived Pi process; bind/confirm/retry/which/cancel/unbind and fail-before-request behavior verified. |
| Git for Windows Bash `5.2.26`, runtime/`ps 3.4.10` | Independent CLI-shaped observations reach the same long-lived Git Bash instance; owning and foreign tables are distinguished. |
| Standalone MSYS2 runtime/`ps 3.6.7` | Pi flow and reverse multi-install ownership check verified. |
| Codex CLI | Process binding validated with a distinguishable CLI process scope; exact version not recorded here. |
| OpenCode CLI | Process binding validated with a distinguishable CLI process scope; exact version not recorded here. |
| Codex App | Multiple logical agent sessions observed converging at one App process; binding is app-wide, not session-scoped. |
| Linux/macOS | Existing success behavior is protected by platform fixtures; untested versions remain unverified rather than hard-excluded. |

This table is evidence, not a product-name whitelist. For an unlisted harness, inspect its topology: process binding can isolate only scopes represented by distinct, reliably identifiable long-lived OS process instances.

### Revalidation

Run the repository gates for every change:

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

Changes to observation, identity, lifecycle, or support claims also require a built-binary runtime check:

1. use `node bin/siyuan.mjs`, never a globally installed CLI;
2. use an isolated `SIYUAN_CLI_CONFIG` unless a designated real-config check is required;
3. run bind and confirm as separate CLI processes from the intended long-lived scope;
4. verify `current which --print json` reports the expected workspace and stable anchor PID/start ID;
5. verify retry preserves the original expiry, cancel leaves confirmed state unchanged, and unbind leaves pending state unchanged;
6. run a safe read-only business request when the designated dev SiYuan is available;
7. for Windows/MSYS changes, verify both the owning and a foreign process table;
8. stop temporary harnesses by recorded PID and start identity, remove isolated state, and prove no pending/binding residue remains.

## Maintenance reference

### Diagnostic routing

| Observation | First owner to inspect |
|---|---|
| Bind and confirm have no common scope | `process-tree.ts` identity/common-anchor rules, then the platform observation termination. |
| Binding works only until a wrapper exits | Expected anchor lifetime; check whether bind/confirm were combined inside a disposable shell. |
| Separate GUI sessions see the same binding | Harness topology; compare reported anchor instances before changing ancestry code. |
| Git Bash/MSYS does not bridge | `windows/msys-process-table.ts`: PATH-selected `ps -e -l`, headers, current WINPID ownership, logical completeness. |
| Binding record is not reclaimed | Instance inspection may be unknown; only PID absence or authoritative start mismatch permits deletion. |
| Project selection unexpectedly fails with a binding present | `protocol.ts` sufficiency result, then `resolve.ts` project/binding agreement. |
| Explicit workspace still encounters binding observation | `resolve.ts` short-circuit ordering is broken. |
| State disappears after a read error | `state.ts` is misclassifying unreadable state as invalid. |

### Update triggers

Update this document in the same change when any of these moves materially:

- process-instance identity, command redaction, or authoritative start-ID source;
- observation termination or conclusive-no-match rules;
- platform capture commands, MSYS columns, ownership detection, or handoff semantics;
- pending/confirmed shape, TTL, retry, cancellation, unbind, or reclamation;
- selection precedence, project conflict, or fail-before-request behavior;
- harness topology guarantees or the tested runtime matrix;
- module ownership, diagnostic routing, or revalidation procedure.

Do not copy local helper mechanics that a maintainer can recover from one obvious source file. Code and tests own implementation details; this document owns the cross-module model, external constraints, evidence boundary, and safe maintenance path.

---
name: process-binding
description: "Maintainer model for experimental caller-process workspace binding: motivation, algorithm, platform observation, evidence, and revalidation."
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

# Process Binding (Experimental)

Read this document when changing process observation, binding identity or lifecycle, workspace-resolution integration, runtime support, or related failure handling. It records cross-file contracts and external constraints that cannot be recovered safely from one source file. Command usage belongs in `skills/siyuan-cli/cli-usage/current.md`.

> [!IMPORTANT]
> Process binding is experimental. It relies on process topology exposed by the operating system and Agent harness rather than a stable Agent-session identity API. Prefer a tested topology. In an unverified topology, the command may decline to select a workspace rather than guess; project workspace files and explicit `--workspace` remain reliable alternatives.
>
> On Windows, an unrelated retained binding can force another caller with incomplete ancestry to select a workspace explicitly. This is the deliberate cost of preventing an uncertain caller from silently using the wrong workspace.

## Why this exists

An Agent often performs many SiYuan operations during one task. Requiring every API or tool invocation to repeat `--workspace` is cumbersome and makes a wrong-target omission more likely. A project file solves this when the work belongs to one directory, while the machine-global current workspace is too broad to isolate concurrent callers. Long-lived Agent work without a suitable project file needs a narrower reusable selection scope.

Many CLI-oriented Agent harnesses execute each tool call as a new OS process. The individual CLI and wrapper processes disappear, but their ancestry usually converges at a longer-lived process owned by the shell or harness. That common process is an observable cross-invocation scope key available without modifying the harness:

```text
call A: short-lived CLI-A → transient wrappers ─┐
                                                ├→ long-lived caller process
call B: short-lived CLI-B → transient wrappers ─┘
```

The useful operation is therefore not “identify the Agent by name.” It is: capture two process chains, find their nearest reliably identified common process instance, and attach a workspace to that anchor so later calls in the same observable scope can reuse it.

The hard part is that process ancestry is imperfect evidence. PIDs are reused, transient creators may exit before observation, Windows and MSYS expose different relations, and a GUI application may host several logical sessions in one process. A wrong match can silently select the wrong SiYuan workspace, so the feature must preserve uncertainty and fail rather than guess. The rest of this document defines that algorithm, its evidence boundary, and the conditions under which maintainers may claim it works.

## System model

Process binding maps a named workspace to an observable OS process scope. It does not identify a logical Agent or application session. Logical callers that share the selected process instance share its binding.

> **Known topology limitation:** Process binding can distinguish callers only when their ancestry exposes distinct long-lived process instances. A harness that multiplexes logical sessions into one host process gives those sessions one shared scope. This has been observed in Codex App, where separate agent sessions converged on the same App process and therefore shared an app-wide binding. Use a project file or explicit `--workspace` when logical sessions require isolation.

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

If `ps` is absent or its table does not contain the current WINPID, the observer keeps the native Windows result. Once the table claims the current process, duplicate ownership, a missing logical parent, a defunct row, or a cycle makes the composed observation incomplete or inconsistent; it does not silently become a complete native result.

### Why these sources are used

Windows APIs expose the current process table, not historical ancestry. `Win32_Process.ParentProcessId` may refer to a process that has already terminated, and the PID may already have been reused; Microsoft explicitly directs callers to compare creation time. Toolhelp snapshots have the same current-state boundary. Once an intermediate creator is gone, neither API can recover its former parent.

MSYS runtime state supplies a different relation rather than repairing the Windows relation. Its process records retain logical PID/PPID and map each record to a Windows PID; `ps -e -l` exposes the columns needed to join that relation to the same Windows snapshot. The Windows PID and normalized creation time remain the canonical instance identity.

Other Windows signals do not substitute for this scope model:

| Candidate | Why it is not used as binding identity |
|---|---|
| Native ancestry alone | Cannot recover the parent of an exited intermediate creator. |
| Standard-stream pipe endpoint | Identifies the process at one end of a particular stream, which changes with redirection and wrapper topology; it is not a general caller-scope contract. |
| Job object or console membership | Depends on how the launcher groups or attaches processes and does not provide a stable, distinct identity for every long-lived caller. |
| Login session, window station, or process group | Commonly groups unrelated terminals and Agents, so its scope is too broad. |
| WMI/ETW process-creation events | Historical reconstruction requires observation to start before the CLI process is created and may require additional privileges or persistent infrastructure. |
| Process name, command text, or inherited environment | Is not instance-unique; command text and environment may also contain sensitive data. |

Source anchors for revalidation:

- Microsoft: [`Win32_Process`](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process), [`PROCESSENTRY32W`](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/ns-tlhelp32-processentry32w), [`GetNamedPipeServerProcessId`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeserverprocessid), [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), and [`GetConsoleProcessList`](https://learn.microsoft.com/en-us/windows/console/getconsoleprocesslist).
- [MSYS2 runtime commit `8fbd9808`](https://github.com/msys2/msys2-runtime/commit/8fbd9808447ee78ed485deead9b79cd1e40c07b7): `winsup/utils/ps.cc`, `winsup/cygwin/pinfo.cc`, `spawn.cc`, and `sigproc.cc`.
- [Git for Windows runtime commit `710e5275`](https://github.com/git-for-windows/msys2-runtime/commit/710e5275eb86d54b45b5f4d71ecc4e1cac1b9302): the corresponding process-table sources use the same core relation model.

## Verification and support boundary

### Claims maintainers must preserve

| Maintenance claim | Durable check | Consequence if it changes |
|---|---|---|
| An exited Windows creator makes the remaining native ancestry incomplete; absence from the snapshot does not reveal its former parent. | `tests/windows-process-tree.test.ts` and the Windows API constraints above. | Do not turn `parent-missing` into a complete no-match or attempt to reconstruct an unknown native edge. |
| A PATH-selected `ps -e -l` table must contain the current WINPID before MSYS augmentation can activate; every logical step must then resolve to one consistent owner. | `tests/msys-process-table.test.ts`, hybrid Windows fixtures, and built-binary checks with Git for Windows and standalone MSYS2. | A foreign table remains unused; duplicate or inconsistent claims produce incomplete evidence rather than a guessed relation. |
| Authoritative start identity distinguishes a reused PID; incomplete identity remains unknown. | `tests/process-tree.test.ts`, `tests/process-binding.test.ts`, and `tests/workspace-selection.test.ts`. | Only PID absence or an authoritative start mismatch permits stale-record deletion. |
| A retained binding plus incomplete or unresolved ancestry fails before networking, while explicit selectors and an empty binding set bypass observation. | `tests/workspace-selection.test.ts` and built-binary failure/bypass checks. | Query failure must not masquerade as absence or silently select another workspace. |
| Retry preserves the original pending lifetime; cancel is nonce-scoped; unbind changes confirmed records only and only in the caller's matched scope. | `tests/process-binding.test.ts`, `tests/current-command.test.ts`, and concurrent-scope built-binary checks. | Lifecycle operations must not widen their deletion scope or rewrite uncertainty as success. |

### Runtime baseline

| Topology | Verified behavior |
|---|---|
| Pi on Windows with standalone MSYS2 `ps 3.6.7` | Separate CLI calls selected one long-lived Pi process. The full lifecycle, fail-before-request behavior, and a binding-selected read-only request to the designated `dev` Kernel were exercised. |
| Git for Windows Bash `5.2.26` with `ps 3.4.10` | Separate CLI calls selected one long-lived Bash instance through the PATH-selected Git table. A separate probe confirmed that standalone MSYS2 did not contain the Git process, demonstrating the installations' table isolation rather than a CLI comparison between tables. |
| Windows PowerShell 5.1 | Separate CLI calls selected the long-lived PowerShell instance using Windows PID and CIM start identity. The capability gate and fixtures establish that MSYS augmentation is optional; the runtime check established native anchor selection. |
| Two concurrent interactive shell scopes | Each long-lived shell anchor held its own confirmed record and resolved its own workspace. Unbind in one scope left the other record active. |
| Linux and macOS adapters | Platform fixtures protect the existing behavior; no runtime version was validated as part of the current baseline. |

These rows describe process capabilities that were observed, not a product whitelist or a fixed supported-version range. For another harness or version, inspect the reported anchor and termination: isolation requires a distinct, reliably identified, long-lived process instance.

Every Windows runtime check that surfaced ancestry termination ended at an exited creator before reaching a trustworthy root. The Git Bash check selected its anchor successfully and did not expose termination; earlier process-table analysis separately established its native-chain break. Runtime checks therefore covered reliable matches and insufficient no-match, while complete conclusive no-match is protected by deterministic fixtures only. This is not a universal Windows claim, and it is not a reason to weaken the fail-loud rule.

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
7. for Windows/MSYS changes, verify that the current WINPID appears in the owning table and not in a foreign installation's table, then run the focused Windows fixture that proves a foreign table cannot augment native ancestry;
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

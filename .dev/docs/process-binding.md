---
name: process-binding
description: "Technical basis, architecture, evidence model, and maintenance constraints for caller-process workspace binding."
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

## Core contract

Process binding lets separate short-lived CLI invocations from one observable OS process scope reuse a named workspace without repeating `--workspace`. It does not identify a logical Agent or session. Logical callers that share the selected OS process instance share its binding.

Binding uses two independent CLI processes because either call alone sees only its own ancestry. The first call records one observation; the second chooses the nearest reliably identified process instance present in both observations:

```text
first CLI  ─┐
            ├─ nearest reliable common instance → confirmed binding
second CLI ─┘
```

The selected anchor determines scope and lifetime. If both calls are launched by one disposable shell, that shell may be the nearest common anchor and the binding correctly dies with it. To bind an outer long-lived caller, do not combine bind and confirm inside a short-lived wrapper that exists only for those commands.

The protocol deliberately does not use process names, executable names, terminal identity, login session, or a bare PID as caller identity. Those values are either too broad or reusable.

## Workspace-selection boundary

Process binding participates only in implicit named-workspace resolution:

```text
--baseUrl
  → --workspace
  → SIYUAN_CLI_WORKSPACE
  → project file / process binding
  → config.current
```

`--baseUrl`, `--workspace`, and `SIYUAN_CLI_WORKSPACE` return before process-binding state or process observation is consulted. A project workspace and a matching process binding may coexist; disagreement is `CURRENT_SELECTION_CONFLICT`.

When no explicit selector exists, `src/workspace/resolve.ts → resolveEffectiveWorkspace()` asks `src/workspace/binding/protocol.ts → findActiveBinding()` for one of three domain outcomes:

| Outcome | Resolver behavior |
|---|---|
| Reliable matching anchor | Use the binding; preserve anchor provenance. |
| Conclusive no-match | Continue to the project or global selection. |
| Insufficient observation | Fail non-zero before constructing a SiYuan request; recommend explicit `--workspace`. |

The resolver never interprets Windows, MSYS, Linux, or macOS stop reasons. Platform evidence is converted to these domain semantics inside the binding subsystem.

## Process evidence model

### Canonical process instance

`src/workspace/binding/process-tree.ts` owns `ProcessNode` and process-instance comparison. Its persisted fields contain Windows/native PID values and safe identity metadata, never raw process command lines.

Identity comparison is intentionally asymmetric in strength:

| Available evidence | Result |
|---|---|
| Same PID and equal authoritative start ID | `pid+start` match |
| Same PID and different authoritative start ID | Conclusive PID reuse; no match |
| A start ID is missing, but PID and command signature match | `pid+signature` degraded match |
| Same PID with incomplete or different non-authoritative evidence | Unknown; never a bare-PID match |
| Different PID | No match |

A command-signature difference cannot prove PID reuse. Only authoritative start-identity disagreement or conclusive PID absence permits automatic reclamation.

### Observation termination

An ancestry observation is an ordered self-first chain plus an explicit termination reason. Current reasons include:

- `root`: traversal reached a trustworthy root;
- `parent-missing`: a creator exited before capture;
- `cycle` or `depth-limit`: the relation cannot be followed safely;
- `inconsistent`: native, MSYS-table, or handoff evidence contradicted itself.

Sufficiency is operation-relative:

- bind/confirm may succeed when both observations contain the same reliable anchor before either truncated tail;
- no common anchor is conclusive only when the observations establish a complete boundary;
- active lookup may match an anchor before a truncated tail;
- active lookup with retained records, no match, and an incomplete tail is insufficient and must fail loudly;
- capture-command failure or an unverifiable output format is an error, not an empty or complete chain.

The current protocol also treats a retained anchor PID appearing in the observed chain without sufficient identity evidence as unresolved, not as conclusive no-match.

## Observation architecture

```text
binding/protocol.ts
        ↓
binding/observation.ts
        ├─ Linux /proc
        ├─ macOS ps
        └─ Windows
             ↓
           windows/capture.ts
             ├─ native CIM relation
             └─ windows/msys-process-table.ts (conditional capability)
```

`ProcessObserver` is the semantic boundary between lifecycle policy and operating-system evidence. It supports:

1. capturing current ancestry for bind/confirm;
2. inspecting recorded anchors and, only when retained records remain, capturing the current scope from the same observation session.

The second operation avoids two full Windows CIM scans per business call. If all records are conclusively stale, caller ancestry and MSYS processing are skipped.

### Linux

Linux reads `/proc/<pid>/stat` for PPID and kernel start time, `/proc/<pid>/cmdline` for a signature and redacted diagnostic summary, and `/proc/<pid>/exe` for executable context. `/proc` start time is the authoritative process-instance value.

A missing `/proc/<pid>/stat` can establish PID absence. An unreadable or malformed entry remains unknown rather than being reclaimed.

### macOS

macOS uses `ps` to read PPID, `lstart`, command, and executable context. The start-time rendering is the process-instance value used by the existing successful path. Per-process query failure is currently conservative: it does not by itself prove PID absence, so reclamation remains unknown.

### Windows native observation

`src/workspace/binding/windows/capture.ts` executes one `Get-CimInstance Win32_Process` query and normalizes every process into a map keyed by Windows PID. `CreationDate` is converted to UTC .NET ticks inside that same query, so bind, confirm, lookup, and reclamation use one source and precision.

Native `ParentProcessId` edges are checked against creation time: a currently observed parent that started after its alleged child means the PID was reused and the edge is inconsistent. A missing parent remains an explicit truncation because Windows does not retain the exited creator's former parent relation.

### Conditional MSYS-to-Windows handoff

MSYS-family shells maintain a logical process table that can survive exec/fork behavior which breaks the native Windows creator chain visible after the fact. Git for Windows Bash uses this MSYS runtime mechanism; it is not a separate process-identity model.

The Windows observer conditionally performs this sequence:

```text
current Windows PID
      ↓
PATH-selected `ps -e -l`
      ↓ table must contain current WINPID exactly once
MSYS PID/PPID logical walk
      ↓ every live row maps through WINPID
same Windows CIM snapshot
      ↓ from outer MSYS instance
native Windows parent walk
```

`windows/msys-process-table.ts` owns the external table format:

- invokes exactly `ps -e -l` rather than the version-dependent `ps -efl` form;
- sets a wide `COLUMNS` value to avoid silent row truncation;
- locates `PID`, `PPID`, and `WINPID` by header name rather than fixed spacing;
- accepts known optional row-status prefixes and spaced trailing fields;
- rejects duplicate ownership, duplicate logical PIDs, cycles, defunct rows, missing parents, and malformed required columns.

The table is considered the owning runtime only when it contains the current CLI WINPID. This rejects a foreign standalone MSYS2 table while running under Git for Windows, and vice versa. PATH and capability determine the branch; product names such as `Git Bash`, `MINGW64`, `MSYS2`, `bash.exe`, or `Pi` do not.

MSYS PID and PPID express relation order only. Persisted identity always uses the mapped Windows PID, Windows start ID, and Windows-derived signature. Windows parent-before-child creation ordering must not be applied to an MSYS logical edge: MSYS exec may preserve the logical PID while replacing its WINPID and Windows creation time.

If `ps` is absent, has an unverifiable format, or does not own the current WINPID, Windows native ancestry remains the evidence. A native truncated chain therefore stays truncated; failure to activate the optional branch never converts incomplete native evidence into a complete no-match.

## Binding state and lifecycle

State lives outside human-edited `config.yaml`:

```text
<config>/process-binding/
├── pending/<nonce>.json
└── bindings/<anchor-derived-key>.json
```

`src/workspace/binding/state.ts` owns validated JSON I/O, filenames, and atomic replacement. `src/workspace/binding/protocol.ts` owns all lifecycle decisions.

### Pending confirmation

- `current bind` validates workspace/project agreement, captures ancestry, and creates a random 32-character hexadecimal nonce.
- Pending records expire 15 minutes after their original `createdAt`.
- `current confirm` revalidates the workspace/project relation and captures a second independent observation.
- A failed but unexpired confirm retains the same record and original expiry; errors provide exact retry and cancel commands.
- `current cancel <nonce>` deletes only that nonce and performs no process observation.
- Invalid or expired nonces are not retryable.

A pending record created by an older version without termination metadata may still confirm when a reliable common anchor is present. Without such a match its observation is insufficient, never conclusively absent.

### Confirmed binding

Confirmed records have no wall-clock TTL. Before implicit selection or unbind, recorded anchors are inspected:

| Inspection | State action |
|---|---|
| PID conclusively absent | Delete as stale |
| PID present with authoritative start ID changed | Delete as reused/stale |
| Identity reliably matches | Retain as live |
| Query fails or identity is incomplete | Retain as unknown |

After reclamation:

- no retained confirmed record means no caller-ancestry capture;
- retained records require current-scope observation;
- `current unbind` removes only confirmed records matching that scope;
- pending confirmations are unaffected by unbind.

Malformed JSON or structurally invalid records are self-healed by deletion. A file or directory that exists but is temporarily unreadable is not malformed: it is retained and causes an explicit state-unavailable error. An unrelated unreadable pending nonce does not block creation of another pending bind because pending records do not participate in active selection.

## Failure and security boundaries

All binding failures use the project's structured stderr error model. Recovery details identify, where relevant:

- whether a confirmed binding was created or still exists;
- whether pending state remains and can be retried;
- exact retry, cancel, inspect, or unbind commands;
- whether a SiYuan request was sent.

A fatal implicit-selection error reports `requestSent: false`. Explicit selectors can bypass process binding when the caller intentionally chooses a target.

Raw command lines can contain tokens, prompts, paths, or other sensitive data. They exist only inside an observation adapter. Persisted/returned nodes contain:

- a SHA-256 command signature for degraded identity matching;
- a bounded, best-effort redacted summary for diagnostics;
- no raw PowerShell or `ps` stderr. Platform stderr is represented only by a diagnostic hash when needed.

Do not add raw process tables or command lines to normal output, persisted records, fixtures copied from a real machine, or issue reports.

## Source and test map

| Question | Authority |
|---|---|
| What constitutes one process instance? | `src/workspace/binding/process-tree.ts` |
| How is platform evidence captured? | `src/workspace/binding/observation.ts` |
| Why and how does Windows use MSYS? | `src/workspace/binding/windows/capture.ts`, `windows/msys-process-table.ts` |
| What is persisted and how is corruption handled? | `src/workspace/binding/state.ts` |
| What are bind/confirm/cancel/unbind and reclamation rules? | `src/workspace/binding/protocol.ts` |
| Where does binding affect workspace precedence? | `src/workspace/resolve.ts`, `src/workspace/workspace-resolution.SPEC.md` |
| What does the CLI expose? | `src/workspace/current-command.ts` |
| Identity and termination invariants | `tests/process-tree.test.ts` |
| Git/MSYS table compatibility | `tests/msys-process-table.test.ts` |
| Native/hybrid Windows composition | `tests/windows-process-tree.test.ts` |
| Lifecycle, persistence, and recovery | `tests/process-binding.test.ts` |
| Selection bypass, match, no-match, and uncertainty | `tests/workspace-selection.test.ts` |
| End-to-end command output | `tests/current-command.test.ts` |

## Verification basis

The implementation is protected by deterministic fixtures for Linux, macOS, Windows native ancestry, Git-for-Windows/MSYS2 table variants, hybrid handoff, truncation, PID reuse, malformed evidence, lifecycle transitions, output, and workspace-resolution ordering.

Real runtime evidence currently establishes:

| Environment | Established evidence |
|---|---|
| Windows 10 `10.0.19045`, Node.js `24.12.0` | Windows CIM start identity and native-chain behavior observed against the built CLI. |
| Pi on Windows with MSYS2 runtime / `ps 3.6.7` | Independent CLI calls reach the same long-lived Pi process through MSYS-to-Windows handoff; full bind/confirm/which, retry, cancel, unbind, stale cleanup, and real fail-before-request behavior observed. |
| Git for Windows Bash `5.2.26`, runtime/`ps 3.4.10` | Two real CLI-shaped observations reach the same long-lived Git Bash instance; PATH-selected owning table includes current WINPID and standalone MSYS2 rejects it. |
| Multiple MSYS installations | Owning-table selection and rejection work in both Git→MSYS2 and MSYS2→Git directions. |

These are tested environments, not a hard support whitelist. An unlisted runtime may work when it provides the required native identity and ancestry capabilities. Missing or inconsistent capability must fail explicitly rather than guess.

The investigation record, sample topology, and external-source references are in `.dev/changes/process-binding-reliability/process-binding-reliability.TECH-REPORT.md`. Those observations justify the design; normal maintainers should start with this document and the current code/tests rather than reconstructing the Change history.

### Revalidation procedure

For ordinary changes:

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

For a runtime or process-observation change, additionally use the built binary in an isolated config and a real long-lived caller:

1. create a temporary catalog with a non-sensitive workspace entry;
2. run bind and confirm as separate CLI processes from the intended caller scope;
3. verify `current which --print json` reports `process-binding`, the expected workspace, and one stable anchor PID/start ID;
4. verify a pending retry preserves `createdAt`, targeted cancel leaves confirmed state unchanged, and unbind leaves pending state unchanged;
5. run a safe read-only business request when the designated dev SiYuan is available;
6. inspect both owning and foreign MSYS tables when changing Windows/MSYS behavior;
7. stop temporary harness processes by recorded PID and start identity, remove isolated state, and confirm no binding or pending residue remains.

Never validate this repository with a globally installed `siyuan`/`siyuan-cli`; use `node bin/siyuan.mjs` after building.

## Maintenance constraints

Update this document in the same change when any of these moves materially:

- `ProcessNode`, identity strength, command redaction, or authoritative start-ID source;
- observation termination or the rule for conclusive no-match;
- platform capture commands, MSYS columns, ownership detection, or handoff semantics;
- pending/confirmed record shape, TTL, retry, cancellation, unbind, or reclamation;
- workspace-selection precedence, conflict handling, or fail-before-request behavior;
- the tested runtime matrix or reproducible verification procedure;
- module ownership or the source/test paths in the map above.

Do not expand this page with local helper behavior recoverable from one obvious source file. Code and tests remain authority for implementation mechanics; this document owns the cross-file model, external constraints, rationale, evidence boundary, and safe maintenance path.

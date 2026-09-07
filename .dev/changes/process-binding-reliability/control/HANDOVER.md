---
title: Process Binding Reliability Supervisor Handover
created: 2026-09-07T23:44:39+08:00
consumed: false
---

# Assume Reader

S348 is a fresh Pi main Agent in the same repository. It can inspect the Git branch, Change artifacts, source, LAI, and this mail thread, but it has none of S604's conversation context. S348 is being prepared to take over supervision of the whole long-task graph, not merely one implementation node.

# Background Context

The `dev` branch already contains a first implementation of caller-process workspace binding. Real Windows/MSYS testing exposed that its Windows-only ancestry capture can stop before the still-running Agent process. Early LAI issues and the former `caller-current` Change mixed verified observations with premature diagnoses and solutions, so the user asked to archive that cycle and restart from a clean problem statement.

The new Change preserves the underlying product goal: a short-lived CLI should infer a stable common caller across two independent calls without requiring Agent harness cooperation. The technical spike established what Windows and MSYS can actually expose; subsequent discussion established retry, output, conditional-platform, and source-layout decisions.

# Current Status

- Integration branch: `fix/process-binding-reliability`.
- Production code has not been modified in this Change.
- LAI parent: #16.
- N1 / LAI #18 is active: finalize the remaining user-owned behavior contract.
- N2 / LAI #19 is the only frontier node: validate two real Git for Windows Bash calls.
- N3 / LAI #20 waits on N1 and N2; no implementation may start before N3 produces a user-accepted SHAPE.
- `graph.yaml` marks this handover pending. S604 remains supervisor until S348 completes the read/question loop and explicitly accepts supervision.

# Trajectory

The first phase archived the tracked `caller-current` development workspace into the ignored local archive, closed old LAI #1/#10/#11 as superseded history, and created a clean DEV-SPEC under `process-binding-reliability`.

The second phase delegated three bounded technical investigations and synthesized them into the TECH-REPORT. The accepted core finding is that Windows native parent-PID interfaces cannot reconstruct an exited intermediate creator, while the current Pi/MSYS2 environment can follow MSYS logical PID/PPID/WINPID and then reconnect to Windows ancestry. Pipe-endpoint PID is retained only as a conditional candidate.

The third phase clarified the user-facing protocol. The user accepted same-nonce confirm retry until original expiry, targeted `current cancel <nonce>`, confirmed-only `unbind`, compact success output by default with explicit `--print json`, strong Agent recovery guidance, capability-detected MSYS as a Windows-side branch, and architecture option B: keep `workspace`/`current` as CLI namespaces while concentrating implementation in `src/workspace/binding/` and moving the shallow `src/current/command.ts` into the workspace domain.

The fourth phase created the long-task graph and LAI #18–#25. The DEV-SPEC was then expanded with the missing historical background and a concrete Problem Statement.

# Key Information for the Successor

- The user is target authority. Do not infer unresolved product guarantees from code or the technical report.
- `DEV-SPEC.md` owns product requirements; `TECH-REPORT.md` owns accepted technical evidence; `graph.yaml` owns route and acceptance state; LAI owns operational issue state.
- The user explicitly wants a teaching-style handover: read the sources, identify what you do not understand or cannot verify, and question S604 before claiming supervision.
- Do not read the archived `caller-current` material as authority. Use it only if a concrete historical question cannot be answered from the new artifacts or Git history.
- N1 remains open on three material choices: business-command behavior when process observation is insufficient, confirmed-binding reclamation responsibility, and the exact supported environment boundary/process-instance validation rule.
- N2 may be advanced independently, but its result is evidence rather than a product decision. It must use the real Git for Windows runtime, not source similarity alone.
- Do not add pipe peers, generic evidence graphs, brokers, identity tokens, or broad workspace reorganization unless a graph condition activates that work and the user approves the changed responsibility.
- The default success text should begin positively, such as `Binding procedure started for workspace "dev". Next: ...`; avoid using the isolated phrase `Binding is not active.` as the headline.
- Current code has an output inconsistency: `api`/`tool` support compact versus JSON, while `current`/`workspace` directly stringify JSON. The accepted change fixes `current` behavior without silently redesigning the project-wide error contract.

# Required Read-and-Question Loop

Read in this order:

1. `AGENTS.md`;
2. `.dev/changes/process-binding-reliability/graph.yaml`;
3. `.dev/changes/process-binding-reliability/process-binding-reliability.DEV-SPEC.md`;
4. `.dev/changes/process-binding-reliability/process-binding-reliability.TECH-REPORT.md`;
5. `src/workspace/workspace-resolution.SPEC.md`;
6. LAI #16, #18, and #19;
7. only then inspect source files needed to test your understanding, especially `src/current/command.ts`, `src/workspace/process-binding.ts`, `src/workspace/process-tree.ts`, and `src/workspace/resolve.ts`.

Before editing, taking LAI #18, changing `graph.yaml`, or advancing N2, reply to S604 with:

- your own concise working model of the target;
- the accepted constraints and decisions you believe are binding;
- the current graph position and why N1/N2 block N3;
- every material ambiguity, contradiction, or claim you cannot independently justify;
- three to seven focused questions whose answers would let you supervise safely.

S604 will answer and may ask you to revise your working model. When you believe the transfer is complete, explicitly state that you accept supervisor responsibility and name any remaining risks you will carry as unresolved. S604 will then mark the handover consumed, release LAI #18, and transfer graph supervision to S348.

# File Reference Map

- `.dev/changes/process-binding-reliability/graph.yaml` — authoritative current route and handover state.
- `.dev/changes/process-binding-reliability/process-binding-reliability.DEV-SPEC.md` — current product contract and open decisions.
- `.dev/changes/process-binding-reliability/process-binding-reliability.TECH-REPORT.md` — Windows/MSYS experiments, constraints, alternatives, and evidence gaps.
- `.dev/changes/process-binding-reliability/delegations/` — prior technical research briefs; useful for auditing investigation scope, not current requirements.
- `src/workspace/workspace-resolution.SPEC.md` — durable workspace resolution contract that this Change must preserve or explicitly revise.
- `src/current/command.ts` — current command surface and fixed-JSON output residue.
- `src/workspace/process-binding.ts` — current pending/confirmed protocol and mixed unbind cleanup.
- `src/workspace/process-tree.ts` — current platform capture and process-instance matching.
- `src/workspace/resolve.ts` — current process-binding integration into workspace selection.

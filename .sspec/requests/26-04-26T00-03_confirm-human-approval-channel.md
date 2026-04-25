---
name: confirm-human-approval-channel
created: 2026-04-26 00:03:26
status: DOING
attach-change: .sspec/changes/26-04-26T00-34_confirm-human-approval-channel/spec.md
tldr: Add a human approval path for confirm-gated operations so agent-driven calls
  can pause for user approval instead of only failing and requiring manual re-run
  with --yes.
---
<!-- @RULE: Frontmatter Type
status: OPEN | DOING | DONE | CLOSED;
tldr: One-sentence summary for list views — fill this!
 -->

# Request: confirm-human-approval-channel

## Background
The current `confirm` behavior is implemented as a safety gate in the CLI execution path. When an operation resolves to `confirm`, the process stops with `CONFIRMATION_REQUIRED` and instructs the operator to re-run the same command with `--yes`, or inspect it first with `--dry-run`.

This works for direct human CLI use. It is much less ergonomic when the caller is an agent or another automation layer that can discover the risky action but should not unilaterally approve it.

## Problem
The current model couples three separate roles into one local CLI retry loop:
1. discovering that an operation needs confirmation,
2. presenting enough context for a decision,
3. supplying the approval.

For agent-driven workflows, these roles naturally split across different actors: the agent proposes, the human approves, and the system executes. The current UX has no first-class handoff path for that approval step.

## Initial Direction
Introduce a human approval path for `confirm`-gated operations.

A possible direction is to let the CLI hand off a pending approval request to a separate local interaction surface, such as:
- an external interactive CLI window, and/or
- a temporary localhost approval page.

The exact surface, transport, lifecycle, and resume model should remain open for design. The request is for the capability, not for one fixed UI implementation.

Useful design goals:
- preserve the safety intent of `confirm`,
- support agent → human approval handoff cleanly,
- show enough context for informed approval,
- keep the existing `--dry-run` flows usable where they still make sense,
- for `--yes`, talk whether to keep it,
- avoid locking the project into one approval channel too early.

## Success Criteria
The request is satisfied when the project gains a clear path for human approval of `confirm`-gated operations that is usable in agent-driven scenarios.

Expected outcomes:
- a `confirm` event can be surfaced to a human without requiring the human to manually reconstruct and re-run the original command,
- the approver can see enough context to make a decision,
- approval, rejection, timeout, and cancellation are handled explicitly,
- the design keeps room for iteration on the approval surface and runtime model.

## Relational Context
Relevant current implementation areas:
- `src/core/guard.ts` — confirm decision and execution gate
- `src/core/permission.ts` — `ConfirmationRequiredError` and permission effects
- `src/core/registry.ts` — risk-derived `requiresConfirmation`
- `src/commands/api.ts` and `src/commands/tool.ts` — `--yes` / `--dry-run` CLI entry points
- `src/core/tools.ts` — tool-side endpoint execution path

Preference for follow-up design work:
- treat this request as a proposal with open design space,
- prefer an approval-channel abstraction over a single hard-coded UI,
- optimize for human-in-the-loop approval in local agent workflows first.


---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol specifications and commence development from the current Request file, following the SSPEC/Development Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILLs + `sspec change new --from <this>`.

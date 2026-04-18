---
revision: 1
date: 2026-04-18T22:55:57+08:00
trigger: "scope-expansion"
---

# pathprogram runtime redesign

## Reason
Review of the initial PointerPath migration identified a structural limitation in the temporary runtime implementation:

1. declarative root-array response filtering regressed `CONTENT_FILTERED` warning behavior
2. `evaluatePointerPath()` and `pointerPathSet()` have mismatched expressive power
3. response shape policy needs an explicit runtime model rather than ad-hoc branching

A follow-up design discussion converged on a stronger internal model: compile pointer syntax into composable path operations and run the same program through get/set/filter runners. This expands the implementation scope beyond the original evaluator helper swap, so the change needs a revision.

## Changes

### Spec Impact
The external contract remains the same:

- payload targets use `path`
- response guards keep `itemsAt`
- grammar still stays minimal

The internal implementation strategy changes from a pair of helpers (`evaluatePointerPath` + `pointerPathSet`) to a compiled `PathProgram` runtime with explicit terminal-filter behavior.

### Design Impact
Implementation is upgraded to three coordinated runners over one compiled op list:

```text
compilePointerPath -> PathOp[]
runGet            -> selector evaluation
runSetSingle      -> unique-parent writeback
runFilterTerminal -> terminal-array replacement for response filtering
```

Current change also fixes the warning regression and keeps response shape policy fail-loud.

### Task Impact
- replace temporary selector helper implementation with PathProgram runtime
- restore root-array warning behavior under declarative response filtering
- add coverage for compile/get/filter behavior and response shape policy
- update design/tasks/memory to reflect the runtime redesign

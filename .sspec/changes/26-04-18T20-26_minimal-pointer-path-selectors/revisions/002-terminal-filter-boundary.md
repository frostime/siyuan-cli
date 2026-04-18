---
revision: 2
date: 2026-04-19T00:47:56+08:00
trigger: "review-feedback"
---

# terminal filter boundary

## Reason
Review of the PathProgram runtime found a future correctness trap: `runPointerFilterTerminal()` can correctly replace one terminal array, but a path with multiple array expansions such as `pages[*].blocks[*]` loses parent ownership after flattening.

If allowed, the current filter signature could replace each parent array with the same global `kept` array. No current endpoint uses this shape, but the boundary should be enforced now so future schemas fail loud instead of producing wrong write-back semantics.

The review also identified small cleanup points in the same runtime code: a redundant empty-op check, an unused return value in `rejectByPolicy()`, and a vague payload-target root-array validation error.

## Changes

### Spec Impact
No external contract expansion. The accepted selector grammar stays the same for reading, but declarative response filtering is constrained by write-back semantics:

```text
runGet may read paths with multiple expansions.
runFilterTerminal may filter only a single terminal expansion.
```

### Design Impact
`runPointerFilterTerminal()` now rejects prefix paths that already contain an expansion before the terminal `[*]` / `key[*]` segment.

Allowed response filter shapes include:

```text
[*]
blocks[*]
data.blocks[*]
```

Rejected response filter shapes include:

```text
pages[*].blocks[*]
[*].blocks[*]
```

### Task Impact
- add fail-loud multi-expand guard in `runPointerFilterTerminal()`
- add regression coverage for rejected multi-expand terminal filtering
- clean redundant helper code and improve payload-target root-array validation message
- record the broader design caution list for later docs/spec-doc work

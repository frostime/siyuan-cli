---
name: resource-level-approval-not-triggered
created: 2026-05-01T20:07:23
status: OPEN
attach-change: null
tldr: "Resource-level `approval` rules (with notebook/path conditions) are silently ignored — the approval flow is never triggered."
---

<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this! -->

# Request: resource-level-approval-not-triggered

## Background

The permission engine supports three effects: `allow`, `deny`, `approval`. Rules can be pure-caller (conditions on `endpoint`/`tool`/`action` only) or resource-qualified (also conditions on `notebook`/`path`).

`deny` works correctly at both levels. `approval` works correctly at the pure-caller level. The approval gate in `guard.ts::executeEndpoint` evaluates:

```ts
const ruleEffect = engine.evaluate({ ...caller, action });
// caller = { endpoint, tool? } — no notebook / path
```

## Problem

A resource-qualified `approval` rule is silently ignored. Example:

```yaml
permission:
  rules:
    - notebook: "20231224140619-bpyuay4"
      action: write
      effect: approval   # ← never fires
```

Dry-run test with `filetree.createDocWithMd` targeting that notebook returns `wouldRequestApproval: false`.

Root cause: the approval gate calls `engine.evaluate()` with caller-only context (no `notebook`/`path`). Resource-qualified rules require resource context to match — without it, `matchesResource` returns false, the rule is skipped, and the engine falls through to `default: allow`. The approval gate never fires.

Phase 2 (`checkContentRef`) does evaluate resource-qualified rules with full context, but it only throws on `deny` — `approval` is silently passed through without surfacing back to the approval gate.

## Initial Direction

Thread resource context into the approval gate (Option A).

Change `applyPayloadGuard` return type from `void` to `{ needsApproval: boolean }` — when any `checkContentRef` call encounters `approval` effect, surface that back to `executeEndpoint`. The approval gate then fires if Phase 2 flagged any approval hit, in addition to the existing pure-caller and risk-auto paths.

The alternative of documenting `approval` as pure-caller only (Option B) was considered and rejected: it converts a bug into a documented limitation without improving user experience. The whole point of resource-level rules is finer-grained control — `approval` should work at that level just as `deny` does.

## Success Criteria

- A rule `{ notebook: "X", action: write, effect: approval }` triggers the approval flow when a write targets notebook X.
- `--dry-run` reports `wouldRequestApproval: true` for such a call.
- Existing pure-caller `approval` rules and risk-auto approval are unaffected.
- The `#TODO` in `.sspec/spec-docs/permission-model.md` is resolved.

## Relational Context

- `src/api/guard.ts` — `executeEndpoint`: approval gate logic (primary change site)
- `src/shared/permission.ts` — `checkContentRef` silently passes `approval`; `applyPayloadGuard` returns `void`
- `docs/extending/30-config.md` — user-facing permission reference; needs clarification regardless of fix direction
- `.sspec/spec-docs/permission-model.md` — spec-doc with `#TODO` marking this issue

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILL + `sspec change new --from <this>`.

---
name: terminology-audit-confirm-guard-approval
created: 2026-04-26 17:59:34
status: OPEN
tldr: Audit and disambiguate the overlapping terminology across permission, guard,
  approval, and risk layers — especially the triple-loaded 'confirm' keyword.
---

# Request: terminology-audit-confirm-guard-approval

## Background

The CLI's safety architecture is composed of four conceptual layers:

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Permission | `src/core/permission.ts` | Rule evaluation: rules + context → effect (allow/deny/confirm) |
| Guard | `src/core/guard.ts` | Execution orchestration: permission → payload/response filtering → approval handoff |
| Approval | `src/approval/*` | Human-in-the-loop approval broker: queue, UI, decision lifecycle |
| Risk | `src/core/schema.ts`, `src/core/registry.ts` | Endpoint risk classification derived from mode/surface/scope |

These layers are internally coherent, but the terminology used across them has accumulated ambiguity — particularly around the keyword `'confirm'`.

## Problem

### 1. `'confirm'` is overloaded (three distinct meanings)

| Location | Type | Meaning |
|----------|------|---------|
| `PermissionEffect = 'confirm'` | Rule effect | "This rule requires human sign-off before proceeding" |
| `ApprovalRisk = 'confirm'` | Approval risk label | "Base-level risk for anything that reaches the approval flow" |
| `requiresConfirmation: boolean` | Derived flag | "The endpoint's risk level (destructive/critical) demands confirmation" |

The call chain conflates them:
```
PermissionEffect.confirm  ──┐
                            ├─→ guard.ts: wouldConfirm → approval.requestAndWait()
RiskLabel(destructive|critical) ─┘
                                    ↓
                          ApprovalRisk.confirm|elevated|destructive|critical
```

`'confirm'` in PermissionEffect means "needs approval"; `'confirm'` in ApprovalRisk means "lowest risk tier that arrived at approval". Same word, different semantics.

### 2. Two risk enums with divergent values

```
RiskLabel:       safe | sensitive | elevated | destructive | critical
ApprovalRisk:    confirm | elevated | destructive | critical
```

Mapping in `buildPreparedApprovalRequest()`:
```ts
risk: (elevated/destructive/critical) ? risk : 'confirm'
// safe → 'confirm', sensitive → 'confirm'
```

A `sensitive` endpoint (e.g. read content) becomes `ApprovalRisk.confirm`, but `'confirm'` in PermissionEffect means "requires human sign-off" — a stronger claim than intended.

### 3. `GuardSpec` ≠ `guard.ts` scope

- `guard.ts` orchestrates three concerns: permission evaluation, payload/response filtering, and approval handoff.
- `GuardSpec` (in `schema.ts`) describes only payload/response filtering — a sub-concern.
- The name "guard" is too generic to distinguish "execution orchestration" from "data filtering".

### 4. `ConfirmationRequiredError` vs approval errors

- `ConfirmationRequiredError` — thrown when broker is unavailable (legacy fallback path)
- `ApprovalRejectedError` / `ApprovalTimeoutError` / `ApprovalCancelledError` — thrown when broker is available

These represent different failure modes (no broker vs broker-mediated rejection), but the naming does not surface that distinction.

## Desired Outcome

- Each concept has a unique, non-overlapping name across all layers.
- The `'confirm'` keyword is disambiguated — ideally reserved for exactly one semantic.
- Code comments, type names, and error classes reflect the clarified terminology.
- No behavioral change — this is a rename-only refactor.

## Scope of Impact

Files with terminology that may need adjustment:
- `src/core/schema.ts` — `PermissionEffect`, `RiskLabel`, `GuardSpec`, `DerivedMeta.requiresConfirmation`
- `src/core/permission.ts` — `ConfirmationRequiredError`, `PermissionEngine` comments
- `src/core/guard.ts` — `wouldConfirm`, `ExecuteOptions`, comments
- `src/core/registry.ts` — `deriveRisk()`, `requiresConfirmation`
- `src/approval/types.ts` — `ApprovalRisk`
- `src/approval/client.ts` — `buildPreparedApprovalRequest()` risk mapping
- `src/approval/errors.ts` — error class names

## Relational Context

This issue was discovered during design discussion of behavior config fields (allowYes, approval.timeout, approval.autoOpen). Resolving the terminology first will prevent further accumulation of ambiguity when new config knobs are added.

Related request: `confirm-human-approval-channel` (DONE) — the approval broker that introduced the `ApprovalRisk` type.

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol specifications and commence development from the current Request file, following the SSPEC/Development Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILLs + `sspec change new --from <this>`.

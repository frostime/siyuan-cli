---
change: "code-quality-regularization"
updated: "2026-04-29T22:51+08:00"
---

# Memory

## State

Implementation complete. Both Fix A and Fix B implemented, verified. Awaiting user review.

## Key Files

- `src/shared/schema.ts` — ~600 lines, primary decomposition target (pointer-path DSL extraction)
- `src/workspace/config.ts` — ~500 lines, secondary decomposition target (workspace resolution chain extraction)

## Knowledge

- [2026-04-29T22:51] [Decision] KISS constraint is absolute: every change MUST reduce complexity. No new abstraction layers, interfaces, factories, or design patterns. Move code only.
- [2026-04-29T22:51] [Decision] Re-export all moved symbols from original files to preserve import paths. Zero consumer changes required.
- [2026-04-29T22:51] [Rejected] `Registry<T>` generic base class — EndpointRegistry and ToolRegistry don't change together; adds abstraction for no present benefit.
- [2026-04-29T22:51] [Rejected] Nested `ExecuteOptions` grouping — would change every call site for 10 fields; not worth the churn.
- [2026-04-29T22:51] [Rejected] Standalone `token.ts` — ~30 lines; file system noise > benefit. Kept as internal helper in `resolve.ts`.
- [2026-04-29T22:51] [Rejected] `cli.ts` lookup map — 5 branches, direct `if` more readable than indirection at current scale.
- [2026-04-29T22:51] [Rejected] `api/command.ts` state grouping — wrapping 3 vars in an object doesn't change the complexity model; zero real benefit.
- [2026-04-29T22:51] [Rejected] Fix B behavior validation extraction — `validateBehaviorRaw` / `normalizeBehavior` / `resolveEffectiveBehavior` are config-file specific and don't form a coherent standalone unit. Leave in `config.ts`.
- [2026-04-29T22:51] [VitalFinding] The project's overall architecture is sound. Issues are localized to specific files, not systemic. The declarative endpoint schema design is the project's strongest architectural decision.
- [2026-04-29T23:00] [Revision] Change narrowed from 5 fixes to 2. C/D/E removed. Fix B scope corrected: no behavior validation extraction, no standalone token.ts.

## Milestones

- [2026-04-29T22:51] Design: Created change with spec.md + design.md + tasks.md. 5 issues documented.
- [2026-04-29T23:00] Revision: Narrowed to 2 fixes (A/B) per GPT review. C/D/E rejected, Fix B scope corrected.
- [2026-04-29T23:10] Implement: Fix A complete — pointer-path DSL extracted to `src/shared/pointer-path.ts`, schema.ts re-exports preserved.
- [2026-04-29T23:20] Implement: Fix B complete — workspace resolution chain extracted to `src/workspace/resolve.ts` (with token helpers internal), config.ts re-exports preserved.

---
name: investigate-nullable-getdocsinfo-response-items
created: 2026-05-11T02:06:20
status: OPEN
attach-change: null
tldr: "Investigate whether block.getDocsInfo can return null array entries under readonly-filtered/unreadable cases before adding defensive response-guard handling."
---

# Request: investigate-nullable-getdocsinfo-response-items

## Background

During review of `.sspec/changes/archive/26-05-10T19-10_expose-missing-kernel-endpoints/`, a subagent flagged a possible robustness issue: `block.getDocsInfo` uses declarative response filtering over a root array, while the archived external contract report says source may set unreadable entries to `nil` in readonly-filtered cases.

Relevant references:

- `.sspec/changes/archive/26-05-10T19-10_expose-missing-kernel-endpoints/reference/missing-kernel-api-contracts.md`
- `src/api/endpoints/block/getDocsInfo.ts`
- `src/api/guard.ts` (`applyResponseGuard` declarative response filtering)

## Problem

If `block.getDocsInfo` can actually return JSON arrays containing `null`, current declarative response guard logic may be insufficient or crash-prone depending on how it extracts item fields. This has not been verified against live kernel/source in this repo.

## Initial Direction

Do not change runtime behavior yet. First perform focused research:

1. Verify upstream SiYuan source behavior for `block.getDocsInfo` in readonly-filtered/unreadable cases.
2. Try to reproduce against a dev workspace if practical and safe.
3. Decide whether the CLI should add generic null-safe response filtering or endpoint-specific handling.

## Success Criteria

- Clear evidence whether `block.getDocsInfo` can return `null` entries in `data`.
- If true, recommended implementation approach with scope and tests.
- If false or obsolete, document why no code change is needed.

## Relational Context

- YAGNI decision on 2026-05-11: do not modify response guard null handling until this behavior is verified.
- Related change: `.sspec/changes/archive/26-05-10T19-10_expose-missing-kernel-endpoints/`.

---

## @AGENT
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILL + `sspec change new --from <this>`.

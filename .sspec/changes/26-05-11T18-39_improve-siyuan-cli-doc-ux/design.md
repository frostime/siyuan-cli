---
change: "improve-siyuan-cli-doc-ux"
created: 2026-05-11T18:39:25
---

# Design: improve-siyuan-cli-doc-ux

## Design Goal

Keep the existing information set intact, but change the reader's path through it.

The intended effect is:

```text
user intent
  → SKILL (single Agent operational router)
  → recipe (scenario playbook)
  → reference docs only when mechanics/config are needed
  → command execution
```

## Structural Decision

No new topic files.
No new command semantics.
No new workflow categories.

This change is a fidelity-preserving refactor:
- move substrate framing earlier without changing the README into a router;
- make `skills/siyuan-cli/SKILL.md` the single Agent operational router;
- push scenario detail from top-level docs into existing recipes;
- make the extension/downstream-skill boundary explicit;
- keep existing facts, but change the order, emphasis, and depth distribution.

## File Transformations

| File | Current shape | Target shape |
|------|---------------|--------------|
| `skills/siyuan-cli/SKILL.md` | Bootstrap → mode gate → flat command list → safety → docs routing → domain rules → gotchas → internals | Bootstrap → first-response rules → layer routing → mode gate → task start points → mandatory recipe triggers → domain/gotcha basics |
| `src/docs/README.md` | quick start first, then workspace anchoring, then general rules, then recipes/reference | compact docs map and reference index; no duplicate full router competing with SKILL |
| `src/docs/recipes/find-target.md` | short command summary for id/hpath/notebook/keyword | scenario playbook for user-mentioned documents/blocks: title, hpath, notebook scope, content keyword, SQL fallback, candidate verification |
| `src/docs/recipes/read-content.md` | short command summary for get info/content/slice | scenario playbook for reading located docs/blocks: inspect, choose source/content/tree/slice, handle partial/large results |
| `src/docs/recipes/connect-workspace.md` | short setup command list | first-run setup playbook with stop conditions when URL/token/workspace are unknown |
| `README.md` | quick start → kernel APIs → tools → workspace → permission → docs control → downstream skills near the end | human-facing intro retained; add only a concise substrate/workflow positioning note near Quick Start |
| `src/docs/cli-usage/extension.md` | extension authoring reference; downstream-skill boundary only implicit | same technical reference, but with an explicit distinction between reusable CLI extension code and reusable agent workflow skills |

## SKILL Content Outline

```text
# SiYuan CLI
1. Bootstrap
2. Layer routing
   - registered endpoint
   - tool
   - raw fallback
   - API extension
   - tool extension
   - downstream Agent SKILL
3. Mode gate
4. Intent-grouped fast commands
5. Safe write protocol
6. Long input pattern
7. Docs routing
8. Domain rules
9. Gotchas
10. Internals
```

### Layer routing behavior

| Task shape | Preferred layer | Why |
|------------|-----------------|-----|
| One kernel call with known endpoint | registered `api` | safest minimum surface |
| Multi-step reusable operation | `tool` | composes calls and shapes output |
| One-off missing kernel API | `api raw` | exploratory escape hatch |
| Repeated missing API | API extension | adds schema, guard, help, format |
| Repeated multi-call workflow | tool extension | reusable code workflow |
| Repeated domain workflow with policy/template/defaults | downstream Agent SKILL | keeps workflow memory out of runtime CLI docs |

## Docs Index Shape

`src/docs/README.md` should be a compact map, not a second Agent router.

```text
Quick start
→ How to use this docs set
   ├─ Agent operational routing lives in SKILL
   ├─ recipes/ = scenario playbooks
   ├─ siyuan-guide/ = domain model
   └─ cli-usage/ = mechanics/config/reference
→ docs map
→ help discovery
```

The detailed docs remain the same; the entry page should avoid duplicating full task routing already present in the SKILL.

## README Positioning

The README must remain a human-facing project introduction. It should not become a task router or docs index.

Required effect:
- the reader still sees the project overview, quick start, and feature set first;
- the reader sees a concise substrate/downstream-skill positioning note earlier than before;
- the reader still finds API, tool, permission, and extension details in the same README.

## Extension Boundary

`src/docs/cli-usage/extension.md` should answer this earlier and explicitly:

- use an API extension when you need a reusable endpoint contract;
- use a tool extension when you need reusable orchestration;
- use a downstream Agent SKILL when you need user-specific policy, templates, notebook defaults, or review cadence.

The file remains a technical reference. The change is to make the decision boundary visible where readers already look for extension guidance.

## Non-Goals

- No new recipe files.
- No new extension types.
- No runtime changes.
- No attempt to encode user-specific workflow defaults into the built-in SKILL.
- No duplicate full routing tables in both SKILL and docs README.

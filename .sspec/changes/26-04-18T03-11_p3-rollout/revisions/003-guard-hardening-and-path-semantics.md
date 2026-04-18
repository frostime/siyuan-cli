---
revision: 3
date: 2026-04-18T17:08:51+08:00
trigger: "review-feedback"
---

# guard hardening and path semantics

## Reason
Final review identified four current-change issues worth closing before P3 acceptance:

1. `applyPayloadGuard()` trusted upstream payload validation too much in `isArray` mode and silently skipped malformed array-shaped inputs.
2. `filetree/getIDsByHPath.ts` uses hpath semantics that current `ResourceKind` cannot express precisely; the omission of `path` guarding needs an explicit decision trail.
3. `filetree/searchDocs.ts` filtered denied rows silently while other imperative response filters emitted `CONTENT_FILTERED` warnings.
4. `kind: "path"` still carries mixed semantics across existing endpoints, and the conservative `network.forwardProxy` critical risk fallback deserves an explicit rationale note.

## Changes

### Spec Impact
P3 acceptance now also requires:

- payload guard hardening against malformed array-shaped inputs in addition to schema validation
- explicit review-documented treatment for hpath-shaped inputs that current resource kinds cannot model
- consistent warning behavior for imperative response filtering on denied read results

### Design Impact
`applyPayloadGuard()` stays schema-driven, but malformed `isArray` payloads now fail loud instead of being ignored. This closes a defense-in-depth gap without widening the contract surface.

`filetree/getIDsByHPath.ts` keeps notebook-only request guarding in this change. The reason is explicit: current `content.paths` semantics target SiYuan block paths, while `getIDsByHPath.path` is an hpath. Treating hpath as block-path would blur the contract.

### Task Impact
- harden `guard.ts` array target handling and add regression tests
- add explicit decision comments / memory entries for hpath-vs-path semantics
- align `searchDocs` filter warning behavior with existing imperative filters
- record remaining `kind: "path"` semantic ambiguity and `forwardProxy` risk rationale in memory/code comments

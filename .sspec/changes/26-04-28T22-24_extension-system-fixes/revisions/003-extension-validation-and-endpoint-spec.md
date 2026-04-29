---
revision: 3
date: 2026-04-29T14:18:37
trigger: ""
---

<!-- @RULE: trigger values: review-feedback | discovery | scope-expansion | correction
本文件记录 design gate 后的范围/设计变更。
spec.md 和 design.md 基线不可变，所有后续演化通过此类文件记录。
文件命名：revisions/NNN-description.md（编号递增）。 -->

# extension-validation-and-endpoint-spec

## Reason
Review feedback identified a parity gap: built-in endpoints pass registry-level schema validation, but API extensions could register without the same guard and response-shape checks. The same review also surfaced that `EndpointSchema` now carries enough cross-field behavior contracts to justify a durable architecture spec-doc.

## Changes

### Spec Impact
The current change now includes one more acceptance target: API extensions must obey the same registry-level `EndpointSchema` validation rules as built-in endpoints. Invalid extension schemas are skipped with a warning instead of being admitted into the registry.

### Design Impact
No execution-path redesign. The change stays local to endpoint registration: `EndpointRegistry.registerExtension()` now reuses the same validation contract already enforced by `register()`, while preserving extension-friendly warn-and-skip behavior.

A new project-level spec-doc is added to define the stable `EndpointSchema` contract: identity derivation, classification-to-risk coupling, guard requirements, CLI coupling, output precedence, multipart semantics, and cache serialization boundaries.

### Task Impact
Add feedback tasks to:
1. update `src/api/registry.ts` to validate API extensions before registration,
2. extend regression tests for invalid extension schemas,
3. author `.sspec/spec-docs/endpoint-schema.md`.

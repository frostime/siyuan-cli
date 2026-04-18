---
revision: 2
date: 2026-04-18T15:54:39
trigger: "scope-expansion"
---

# array payload target authorization

## Reason
P3 rollout reached Phase 6 and identified five remaining endpoint holdouts that cannot be migrated under the P1 flat-field `payloadTargets` contract:

- `block.transferBlockRef.refIDs[]`
- `filetree.moveDocs.fromPaths[]`
- `filetree.moveDocsByID.fromIDs[]`
- `export.exportResources.paths[]`
- `filetree.getIDsByHPath.paths[]`

Current P1 contract only supports a flat string payload field. Phase 6 cannot remove the legacy bridge while these endpoints still require legacy tags, so P1 must be amended first.

## Changes

### Spec Impact
P1 `PayloadTargetSpec` now supports array-valued fields through `isArray?: boolean`.

Default array authorization semantics are conservative:

```text
isArray=true -> iterate payload[field] as string[]
any denied item -> reject the whole request
no filtering / partial success in this revision
```

This makes array authorization predictable and avoids silent partial execution.

### Design Impact
`PayloadTargetSpec` shape expands to:

```ts
interface PayloadTargetSpec {
  field: string;
  kind: ResourceKind;
  access: "read" | "write";
  isArray?: boolean;
}
```

The guard execution loop treats `isArray` as a value-shape modifier only. It does not introduce JSONPath-like field syntax and does not alter `guard.response.itemsAt` semantics.

### Task Impact
- update `src/core/schema.ts` type and docs
- update `src/core/guard.ts` payload target execution
- add P1 contract tests for array payload targets
- run P1/P2/P3 targeted regression checks before returning to P3 holdout migration

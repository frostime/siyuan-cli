---
name: classification-permission-policy-redesign
status: PLANNING
change-type: single
created: 2026-05-14T04:18:51
reference:
  - source: "reference/chat-thread-export.xml"
    type: "doc"
    note: "Exported conversation that motivated this change."
  - source: "reference/destructive-risk-auto-approval-request.md"
    type: "request"
    note: "Observed destructive/critical risk-auto approval behavior and reproduction paths."
---

# classification-permission-policy-redesign

## Problem Statement

13 / 78 registered endpoints currently trigger approval through `classification → risk → risk-auto approval`, even when no explicit permission rule requests approval. This makes `classification` act as hidden policy: endpoint metadata silently changes runtime approval behavior, and users cannot predict or configure the trigger from permission rules alone.

The current model also overloads terminology:

- `scope: batch` is treated as destructive risk, although batch cardinality alone does not imply destructive behavior.
- `surface: workspace` mixes file-layer access with broader workspace semantics.
- `risk` is both a display label and an approval gate input.
- Unknown permission rule fields are ignored by the matcher, so a rule such as `risk: destructive` can accidentally become a broad unconditional rule.

## Proposed Solution

### Approach

Rebuild endpoint classification as factual metadata:

```ts
classification: {
  action: 'read' | 'write' | 'invoke'
  domain: 'meta' | 'content' | 'config' | 'storage' | 'runtime' | 'network' | 'ui'
  concerns?: Concern[]
  cardinality?: 'single' | 'batch' | 'global'
}
```

Approval policy remains explicit and traceable through permission rules. `classification` may produce display metadata such as `severity`, but it must not decide approval by itself.

Permission rules use the same action vocabulary as classification: `action: read|write|invoke`. Existing `read` and `write` rules remain valid; invocation endpoints are matched explicitly with `action: invoke`.

### Key Change

**Model A: Factual classification**

Replace the authored `mode/surface/scope/operation/riskOverride` model with `action/domain/concerns/cardinality`. `cardinality` describes impact size only; it is not a risk threshold.

**Policy B: Explicit approval**

Remove the hard-coded risk-auto approval path in `guard.ts`. Approval occurs only when permission evaluation returns `approval`, resource-level permission evaluation returns `approval`, or the user explicitly bypasses approval with allowed `--yes` behavior.

**Display C: Severity hint**

Replace the five-level `risk` output with a derived three-level `severity: low|medium|high` display hint. `severity` is not authored by endpoint schemas and is not used as a permission predicate in this change.

**Compat D: Input normalization**

Accept legacy endpoint and extension schemas using `mode/surface/scope` during migration by normalizing them at registry boundaries. Output uses the new normalized classification vocabulary.

**Safety E: Permission rule validation**

Reject unknown permission rule fields in both global/workspace config and project config. Unknown fields must fail fast instead of being ignored by the matcher.

**UX F: Recommended permission template**

Add a recommended permission template to workspace creation/update UX and docs. The template teaches users how to opt into approval rules after risk-auto approval is removed. Conservative examples may be preinstalled; stricter examples may be present as commented few-shot guidance where the config writer supports comments.

### Scope Summary

| File | Change |
|------|--------|
| `src/shared/schema.ts` | Define new classification, concern, cardinality, and severity types; update `PermissionRule.action`, `PermissionContext.action`, and `DerivedMeta`. |
| `src/api/registry.ts` | Normalize legacy classification input; derive normalized tags and `severity`; stop deriving policy-driving `risk`. |
| `src/api/guard.ts` | Remove risk-auto approval; update `IMPLICIT_WORKSPACE` warning to use action/severity. |
| `src/shared/permission.ts` | Keep rule matching semantics; rely on validated rule shapes. |
| `src/workspace/config.ts` | Validate unknown permission rule fields in global defaults and workspace configs. |
| `src/workspace/project-config.ts` | Validate unknown permission rule fields in `.siyuan-cli.yaml`. |
| `src/workspace/command.ts` | Add or expose a recommended permission template during workspace setup/update where appropriate. |
| `src/extension/cache.ts` | Accept normalized classification cache data; on incompatible legacy cache, ask users to rerun `siyuan extension cache` instead of migrating old cache files. |
| `src/api/endpoints/**` | Migrate built-in endpoint schemas to the new classification vocabulary after normalization exists. |
| `src/api/command.ts` | Update `api list` / `api describe` output and tag help from risk/mode/surface/scope to action/domain/cardinality/severity. |
| `src/docs/**`, `skills/siyuan-cli/SKILL.md` | Document new classification semantics, explicit approval rules, and recommended permission examples. |
| `.sspec/spec-docs/endpoint-schema.md` | Update endpoint classification and metadata contract. |
| `.sspec/spec-docs/permission-model.md` | Update approval semantics and permission rule validation contract. |

Unchanged:

- Existing permission rules using `action: read|write` remain valid.
- Permission rules without an `action` condition continue to match all endpoint actions, including `invoke`.
- Permission rule `effect: allow|deny|approval` remains unchanged.
- Approval broker, `allowYes`, `--yes`, payload guards, and response guards retain their operational meaning.
- This change does not add `domain`, `concern`, `severity`, or `cardinality` as permission rule predicates.

### Design Reference

→ See [design.md](./design.md)

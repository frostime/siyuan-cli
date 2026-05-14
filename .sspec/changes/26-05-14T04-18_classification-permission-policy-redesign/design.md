---
change: "classification-permission-policy-redesign"
created: 2026-05-14T04:18:51
---

# Design: classification-permission-policy-redesign

## 1. Classification Contract

Classification describes endpoint facts:

```text
action      = how the endpoint interacts with the system
domain      = which protection boundary it touches
concerns    = notable behaviors worth explaining
cardinality = impact-size hint
```

```ts
type EndpointAction =
  | 'read'    // obtains information
  | 'write'   // changes durable user/system state
  | 'invoke'; // triggers a capability that is not ordinary data read/write

type EndpointDomain =
  | 'meta'     // low-sensitivity operational facts
  | 'content'  // user-authored notes, blocks, refs, attrs, document tree
  | 'config'   // sensitive settings, account, sync, AI, or token-like configuration
  | 'storage'  // workspace file layer, assets, .sy files, import/export resources
  | 'runtime'  // kernel, process, database, index, or sync runtime control
  | 'network'  // outbound or proxied network capability
  | 'ui';      // notification or presentation-only UI effect

type Concern =
  | 'notify'
  | 'process-exit'
  | 'high-load'
  | 'reindex'
  | 'id-regeneration'
  | 'filesystem'
  | 'network-request'
  | 'unbounded-read';

type Cardinality = 'single' | 'batch' | 'global';
type Severity = 'low' | 'medium' | 'high';

interface EndpointClassification {
  action: EndpointAction;
  domain: EndpointDomain;
  concerns?: Concern[];
  cardinality?: Cardinality;
}

interface DerivedMeta {
  classification: EndpointClassification;
  tags: string[];
  severity: Severity;
}
```

`severity` is derived by the registry. Endpoint authors do not set it.

## 2. Domain Semantics

| Domain | Boundary | Example endpoints |
|--------|----------|-------------------|
| `meta` | Low-sensitivity operational facts | `system.version`, `system.currentTime`, `system.bootProgress` |
| `content` | User-authored notes and semantic graph | `block.getBlockKramdown`, `block.updateBlock`, `attr.setBlockAttrs`, `filetree.searchDocs` |
| `config` | Settings and account/sync/AI/token-like data | `system.getConf` |
| `storage` | File-layer workspace access, assets, import/export resources | `file.getFile`, `file.putFile`, `asset.upload`, `export.exportResources` |
| `runtime` | Kernel, process, database, index, or sync control | `system.exit`, `sqlite.flushTransaction` |
| `network` | Outbound or proxied network capability | `network.forwardProxy` |
| `ui` | Notification or presentation-only user-interface effect | `notification.pushMsg`, `notification.pushErrMsg` |

## 3. Concern Semantics

Concerns are explanatory metadata. They are not permission rule predicates in this change.

| Concern | Meaning | Example |
|---------|---------|---------|
| `notify` | Shows a UI notification | `notification.pushMsg` |
| `process-exit` | Can terminate or disrupt the kernel process | `system.exit` |
| `high-load` | Can produce kernel, database, or index load | `sqlite.flushTransaction` |
| `reindex` | Can trigger reference/index rebuild work | `block.transferBlockRef` |
| `id-regeneration` | Can invalidate child ids, refs, or attrs | document-level overwrite flows |
| `filesystem` | Touches the workspace file layer directly | `file.putFile`, `file.removeFile` |
| `network-request` | Performs outbound or proxied network request | `network.forwardProxy` |
| `unbounded-read` | May read broadly unless caller narrows payload | broad search/export flows |

## 4. Permission Action Semantics

Permission rules use the same action vocabulary as classification:

```ts
type PermissionAction = 'read' | 'write' | 'invoke';
```

| Permission action | Matches |
|-------------------|---------|
| `read` | read endpoints |
| `write` | write endpoints |
| `invoke` | invoke endpoints |

Existing `read` and `write` rules remain valid. Invocation endpoints are no longer folded into `write`; users who want to confirm invocation endpoints should write explicit `action: invoke` or endpoint-specific rules.

Endpoint action and resource access are separate runtime concepts:

| Concept | Type | Use |
|---------|------|-----|
| `endpointAction` | `read | write | invoke` | caller-level permission rule matching |
| `resourceAccess` | `read | write` | payload target checks and content filtering |

For resource access, invoke endpoints map to write:

```ts
function resourceAccess(action: EndpointAction): 'read' | 'write' {
  return action === 'read' ? 'read' : 'write';
}
```

```yaml
permission:
  rules:
    - action: invoke
      effect: approval
```

## 5. Severity Derivation

`severity` is a display hint for list/describe/help output. It is not a gate.

Suggested derivation:

| Facts | Severity |
|-------|----------|
| `action: read` + `domain: meta` | `low` |
| `action: invoke` + `domain: ui` + `concerns: [notify]` | `low` |
| `action: read` + `domain: content/config/storage` | `medium` |
| `action: write` + `domain: content` | `medium` |
| `action: write` + `domain: storage` | `high` |
| `domain: runtime/network` with non-read action | `high` |
| `concerns` contains `process-exit`, `filesystem`, `network-request`, `reindex`, `id-regeneration`, or `unbounded-read` | `high` |

`cardinality: batch` alone does not increase severity. Combinations not listed above default to `medium`.

## 6. Approval Gate

Remove the classification-driven approval condition:

```ts
ruleEffect === 'allow' && isHighRisk(entry.meta.risk)
```

Approval gate becomes:

```ts
const wouldRequestApproval =
  ruleEffect === 'approval' ||
  phase2NeedsApproval;
```

Trigger reason text should only describe explicit approval sources:

```text
matched approval rule
resource-level approval rule
```

No trigger reason should mention risk-auto approval.

## 7. IMPLICIT_WORKSPACE Warning

The warning should protect users from accidentally operating on `config.current` when the command is not a low-risk read.

```ts
function shouldWarnImplicitWorkspace(meta: DerivedMeta): boolean {
  if (meta.classification.action !== 'read') return true;
  return meta.severity === 'high';
}
```

Low/medium read operations may run without the warning. Write and invoke operations warn when the workspace source is `global-current`.

## 8. Tags and CLI Output

Registry tags use normalized vocabulary:

```text
action:read
action:write
action:invoke
domain:content
domain:storage
concern:filesystem
cardinality:batch
severity:high
```

`api list` and `api describe` output should expose:

```json
{
  "classification": {
    "action": "write",
    "domain": "content",
    "cardinality": "batch"
  },
  "severity": "medium",
  "tags": ["action:write", "domain:content", "cardinality:batch", "severity:medium"]
}
```

Do not expose top-level `risk` in new output. Do not generate `risk:*` tags from the normalized model.

## 9. Legacy Input Normalization

Legacy endpoint and extension schemas may still provide:

```ts
classification: {
  mode: 'read' | 'write' | 'invoke';
  surface: 'meta' | 'content' | 'asset' | 'workspace' | 'runtime' | 'network';
  scope: 'single' | 'batch' | 'global';
}
```

Registry normalization maps them to the new model:

| Legacy input | Normalized output |
|--------------|-------------------|
| `mode` | `action` |
| `surface: meta` | `domain: meta` |
| `surface: content` | `domain: content` |
| `surface: asset` | `domain: storage` by default |
| `surface: workspace` | `domain: storage` |
| `surface: runtime` | `domain: runtime` |
| `surface: network` | `domain: network` |
| `scope` | `cardinality` |

Endpoint-specific normalization may refine domains and concerns where legacy fields are too coarse:

| Endpoint | Normalized classification |
|----------|---------------------------|
| `system.getConf` | `action: read`, `domain: config` |
| `notification.pushMsg` / `notification.pushErrMsg` | `action: invoke`, `domain: ui`, `concerns: ['notify']` |
| `system.exit` | `action: invoke`, `domain: runtime`, `concerns: ['process-exit']` |
| `network.forwardProxy` | `action: invoke`, `domain: network`, `concerns: ['network-request']` |
| `file.putFile` / `file.removeFile` / `file.renameFile` | `action: write`, `domain: storage`, `concerns: ['filesystem']` |
| `query.sql` | `action: read`, `domain: content` |

Cache incompatibility is handled as a hard cache read failure, not as silent stale registration. If cached classification data cannot be normalized safely, the extension is treated as uncached/stale and registration fails with guidance to regenerate cache:

```text
Extension schema cache is incompatible with the current classification model. Run `siyuan extension cache` to regenerate it.
```

A full cache migration path is not required in this alpha-stage change.

## 10. Permission Rule Validation

Accepted permission rule fields are fixed in this change:

```ts
interface PermissionRule {
  endpoint?: string;
  tool?: string;
  action?: 'read' | 'write' | 'invoke';
  notebook?: string;
  path?: string;
  root_id?: string;
  effect: 'allow' | 'deny' | 'approval';
  note?: string;
}
```

Global config, workspace config, and project config must reject unknown rule fields before normalization.

Invalid example:

```yaml
permission:
  rules:
    - risk: high
      effect: approval
```

Required behavior:

```text
CONFIG_PARSE_ERROR / PROJECT_CONFIG_PARSE_ERROR:
Unknown permission rule field "risk" at permission.rules[0].
```

## 11. Recommended Permission Template

After risk-auto approval is removed, users need explicit examples for restoring conservative approval behavior.

Recommended built-in template:

```yaml
permission:
  default: allow
  rules:
    # Confirm durable state changes.
    - action: write
      effect: approval
      note: "Confirm write operations"

    # Confirm capability invocations such as process control or network proxy.
    - action: invoke
      effect: approval
      note: "Confirm invoke operations"
```

Optional stricter few-shot examples for docs or comment-preserving generated files:

```yaml
# Confirm direct workspace file-layer writes.
# - endpoint: "file.*"
#   effect: approval
#   note: "Confirm direct file operations"

# Confirm outbound/proxied network calls.
# - endpoint: "network.forwardProxy"
#   effect: approval
#   note: "Confirm network proxy requests"

# Confirm process control.
# - endpoint: "system.exit"
#   effect: approval
#   note: "Confirm kernel exit"
```

Placement:

- Workspace creation/update UX may install the conservative `action: write` approval rule when creating a new workspace config profile, if this does not overwrite existing user rules.
- Docs and generated examples should include stricter commented examples as few-shot guidance.
- Existing workspaces should not be silently modified.

## 12. Endpoint Examples

### attr.batchSetBlockAttrs

```ts
classification: {
  action: 'write',
  domain: 'content',
  cardinality: 'batch'
}
```

Derived severity: `medium`.

### file.removeFile

```ts
classification: {
  action: 'write',
  domain: 'storage',
  concerns: ['filesystem']
}
```

Derived severity: `high`.

### network.forwardProxy

```ts
classification: {
  action: 'invoke',
  domain: 'network',
  concerns: ['network-request']
}
```

Derived severity: `high`.

### system.exit

```ts
classification: {
  action: 'invoke',
  domain: 'runtime',
  concerns: ['process-exit']
}
```

Derived severity: `high`.

### notification.pushMsg

```ts
classification: {
  action: 'invoke',
  domain: 'ui',
  concerns: ['notify']
}
```

Derived severity: `low`.

## 13. Migration Phases

| Phase | Goal |
|-------|------|
| 1 | Add new classification types and registry normalization. |
| 2 | Derive severity and normalized tags; update CLI list/describe output. |
| 3 | Remove risk-auto approval and update implicit-workspace warning. |
| 4 | Add permission rule unknown-field validation for global, workspace, and project configs. |
| 5 | Add recommended permission template in workspace UX/docs. |
| 6 | Migrate built-in endpoint schemas to the new classification shape. |
| 7 | Update spec-docs, user docs, SKILL, and extension authoring docs. |

## 14. Non-Goals

- Do not add `domain`, `concern`, `severity`, or `cardinality` as permission rule predicates.
- Do not add a configurable risk-auto approval threshold.
- Do not keep generating `risk:*` tags from the normalized model.
- Do not add `riskOverride` or any severity override field.
- Do not migrate old extension cache files; ask users to regenerate incompatible cache.
- Do not silently modify existing workspace permission rules.

---
change: "raw-api-fallback"
created: 2026-05-10T19:10:15
---

# Design: raw-api-fallback

<!-- MUST maintain quality bar (non-negotiable):
Use semi-structured, formalized expression over flat prose.
Goal: maximize information density, minimize ambiguity, optimize reader comprehension.
In short: show, don't describe.

Fence nesting: when showing content that contains ```, outer fence MUST use more backticks. Always outer > inner.

Recommended tools (non-exhaustive):
- typed code block: interfaces, types, schemas, config, prompts...
- ASCII diagram: call chains, state machines, module trees, content outlines...
- table: before/after comparison, option tradeoffs, scope mapping...
- labeled items: multi-change annotation (Fix A / Feat B / Step 1...)
- pseudocode, decision trees, constraint lists

Anti-pattern:
  ❌ "We will add a function that accepts X and returns Y"
  ✅ `def process(x: Input) -> Output: ...`

  ❌ "The request first goes through module A, then is passed to B"
  ✅ request → A.validate() → B.process() → response
-->

<!-- SHOULD organize by the nature of the change. No fixed sections required.
Reference patterns by change type (pick what fits, not mandatory):

Feature/Bugfix  → interface signatures + behavioral flow + data model
Refactor        → before/after structural comparison + migration steps
Docs/Templates  → content outline + section hierarchy
Prompt/Rules    → before/after examples + decision logic
Config/Schema   → schema definition + migration path + compatibility strategy
-->

## 1. Config Contract

```ts
export interface RawApiBehaviorConfig {
    /** Default false. Must be true to invoke raw API. */
    enabled?: boolean;
    /** Endpoint-id glob patterns, e.g. "block.getDocInfo", "attr.batch*", "*". */
    allow?: string[];
}

export interface BehaviorConfig {
    allowYes?: boolean;
    approval?: {
        timeout?: number;
        autoOpen?: boolean;
    };
    rawApi?: RawApiBehaviorConfig;
}

export interface ResolvedBehaviorConfig {
    allowYes: boolean;
    approval: { timeout: number; autoOpen: boolean };
    rawApi: { enabled: boolean; allow: string[] };
}
```

### Config examples

```yaml
# Global config.yaml or project .siyuan-cli.yaml
behavior:
  rawApi:
    enabled: true
    allow:
      - "attr.batch*"
      - "block.getDocInfo"
      - "filetree.getFullHPathByID"
```

```yaml
# Explicit all-endpoint fallback; intentionally noisy in docs.
behavior:
  rawApi:
    enabled: true
    allow:
      - "*"
```

### Resolution rule

`rawApi` resolves as a whole object, not field-by-field.

```text
rawApi = firstDefined(project.behavior.rawApi,
                      workspace.behavior.rawApi,
                      defaults.behavior.rawApi,
                      { enabled: false, allow: [] })
```

Rationale: the user required `enabled` and patterns to be set together. Whole-object resolution avoids accidentally combining `enabled: true` from one scope with broad patterns from another scope.

## 2. Raw Command Interface

```text
siyuan api raw <endpoint> -j '<json>'
siyuan api raw <endpoint> -f payload.json
siyuan api raw <endpoint> -f -
```

| Input | Normalized id | Kernel path |
|-------|---------------|-------------|
| `block.getDocInfo` | `block.getDocInfo` | `/api/block/getDocInfo` |
| `/api/block/getDocInfo` | `block.getDocInfo` | `/api/block/getDocInfo` |

No per-payload flags are generated because raw has no schema.

## 3. Behavior Flow

```text
CLI args
  → parse endpoint shape
  → parse JSON payload from --json / --file
  → load config + resolve workspace/token
  → resolve behavior.rawApi
  → require enabled === true
  → require allow.length > 0
  → require normalized endpoint id matches allow pattern
  → warn stderr: RAW_API_NO_SCHEMA_GUARD
  → SiyuanClient.call(kernelPath, payload)
  → stdout: JSON.stringify(data, null, 2)
```

## 4. Error / Warning Contract

| Code | Stream | Condition | Example hint |
|------|--------|-----------|--------------|
| `RAW_API_DISABLED` | stderr + nonzero exit | `rawApi` missing or `enabled !== true` | `Set behavior.rawApi.enabled: true and behavior.rawApi.allow: ["block.getDocInfo"]`. |
| `RAW_API_ALLOW_REQUIRED` | stderr + nonzero exit | `enabled: true` but allow missing/empty | `Add at least one endpoint pattern; use "*" only if you intend to allow all raw APIs.` |
| `RAW_API_ENDPOINT_DENIED` | stderr + nonzero exit | endpoint id matches no allow pattern | `Allowed patterns: attr.batch*, block.getDocInfo`. |
| `RAW_API_INVALID_ENDPOINT` | stderr + nonzero exit | not `/api/<group>/<name>` or `<group>.<name>` | `Use block.getDocInfo or /api/block/getDocInfo`. |
| `RAW_API_NO_SCHEMA_GUARD` | stderr warning | every successful raw invocation | `No payload schema, resource guard, approval, or response filter is applied.` |

Stdout stays pure JSON for successful calls and remains safe for `jq`.

## 5. Non-goals

| Not implemented | Reason |
|-----------------|--------|
| Resource-level permission guard | raw has no `EndpointSchema.guard.payloadTargets`; pretending otherwise creates false safety. |
| Risk auto-approval | no reliable classification exists for arbitrary raw endpoints. Config allowlist is the explicit authorization mechanism. |
| Compact formatting | raw output should be machine-readable JSON, not endpoint-specific text. |
| Response filtering | raw has no response schema and may return arbitrary shapes. |

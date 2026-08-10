---
name: permission-model
description: "Cross-module permission contract: ordered rules, resource checks, tool boundaries, and approval effects."
updated: 2026-08-10
scope:
  - /src/shared/permission.ts
  - /src/api/guard.ts
  - /src/shared/schema.ts
  - /src/tool/command.ts
  - /src/tool/registry.ts
  - /src/workspace/config.ts
  - /src/workspace/resolve.ts
  - /src/workspace/project-config.ts
deprecated: false
replacement: ""
---

# Permission Model

## Core contract

Permission is one ordered rule list. Rules are evaluated top-to-bottom and the **first full match wins**. There is no separate deny-overrides-allow phase. A rule may constrain an endpoint, tool, action, notebook, or ID-based path; omitted conditions are wildcards. Every rule has an effect: `allow`, `deny`, or `approval`.

Endpoint classification supplies the caller action (`read`, `write`, or `invoke`). It is metadata, not an approval policy. Resource access (`read` or `write`) is declared separately on `guard.payloadTargets`.

`root_id` is normalized to `path: "**/<root_id>.sy"`; it is a convenience alias for stable document identity. Notebook and path conditions use SiYuan IDs/ID-based paths, not mutable hpaths. Unknown rule fields are hard configuration errors. The former `ROOT_ID_OVERRIDES_PATH` diagnostic is not currently emitted; normalization still gives `root_id` precedence.

The rule field and validation contract lives in `src/shared/schema.ts` and is applied while loading global and project configuration.

## Rule cascade

For an invocation with project permission:

```text
rules   = project.rules ++ workspace.rules ++ defaults.rules
default = project.default ?? workspace.default ?? defaults.default ?? 'allow'
```

Without project permission, the project layer is simply absent. Because matching is first-match-wins, project rules shadow lower layers only where they match; lower layers remain active elsewhere.

Project permission is independent of workspace selection. Passing `--workspace prod` does not disable permission rules from a `.siyuan-cli.yaml` found in the current directory. This keeps the target choice and directory-scoped guardrails orthogonal.

## Two-phase evaluation

The execution path is:

```text
caller gate → payload/resource gate → approval gate → Kernel call → response filtering
```

### Phase 1: caller gate

`checkEndpoint()` or `checkTool()` sees only endpoint, tool, and action.

- A matching pure-caller deny rejects immediately.
- Resource-qualified rules defer their decision until resource data exists.
- If no rule matches, the configured default applies.

A pure-caller rule has no `notebook` or `path` condition. Rule ordering therefore matters: a broad pure-caller rule can shadow a later resource-qualified rule.

### Phase 2: resource gate

`applyPayloadGuard()` evaluates each declared `guard.payloadTargets` entry with the full endpoint/tool/action/notebook/path context.

- `deny` raises `CONTENT_DENIED`.
- `allow` passes.
- `approval` records that the later approval gate must run.
- No matching rule falls through to the default effect.

Phase 2 runs only when the schema declares payload targets. If an endpoint has no targets, resource-qualified rules cannot be applied to its payload; schema authors must declare the resources that matter.

Response filtering uses `deny` only. An `approval` rule cannot pause after a Kernel response has already executed, so approved-effect matches remain visible in filtered responses.

## Tool permission boundary

A tool is the semantic boundary for a multi-endpoint operation. It knows whether the operation needs read access, write access, or both, and it can resolve polymorphic or embedded references.

Use one of these mechanisms:

| Mechanism | Use | Consequence |
|---|---|---|
| `ToolSchema.guard.payloadTargets` | direct ID/notebook/path fields | evaluated before `run()` |
| `ctx.permission.checkContentRef()` | embedded or polymorphic references | tool chooses the meaningful resource check |
| `ctx.callEndpoint(..., { bypassPermission: true })` | internal calls after the tool's own authoritative check | skips permission, approval, and response filtering but keeps validation, debug, and dry-run |

A write tool that must inspect a protected resource before changing it must check both read and write access. Without a tool-level check, response filtering can turn “denied” into a misleading “not found” result and each internal endpoint may be evaluated under the wrong semantic boundary.

`ctx.callEndpointRaw()` skips permission, approval, payload validation, response filtering, dry-run, and debug. It is reserved for internal lookups whose re-entry into the endpoint pipeline would distort the tool's meaning.

## Approval effects

Approval is a pre-execution gate. It can come from:

- a pure-caller rule whose effect is `approval`;
- a resource-qualified rule encountered during Phase 2.

Derived endpoint severity does not create approval. After permission checks pass, `guard.ts` combines the explicit approval signals and either requests a human decision or continues. `--yes` bypasses approval only when the resolved behavior permits it.

The approval broker's process and persistence contract is in `src/approval/approval-broker.SPEC.md`.

## Rule ordering patterns

Put specific rules before broad rules:

```yaml
# Specific deny before broad allow
rules:
  - notebook: "A"
    path: "/secret/**"
    effect: deny
  - notebook: "A"
    effect: allow

# Specific allow before broad deny
rules:
  - tool: "append-content"
    notebook: "A"
    effect: allow
  - action: write
    effect: deny
```

A final catch-all rule is valid, but it must come after every exception it should not shadow.

## Change constraints

When changing permission behavior:

- preserve first-match ordering; do not introduce implicit deny precedence;
- keep endpoint action distinct from resource access direction;
- declare every resource needed for Phase 2;
- keep tool-level checks authoritative for composed operations;
- preserve the `bypassPermission` boundary and its documented skipped stages;
- keep approval explicit and pre-execution;
- update behavior-oriented tests for rule ordering, resource filtering, tool checks, and approval.

For structured error output and exit handling, read `error-model.md`. For workspace/project overlay semantics, read `src/workspace/workspace-resolution.SPEC.md`.

---
title: Read installed source
slug: read-source
summary: Last-resort code paths for questions no command output, error, or resource can answer.
---

# Read installed source

Use this only when blocked: a command's observable behaviour contradicts the documented contract, an error gives no actionable field, or an extension must match an exact runtime shape. Reading code costs far more context than running `--help`, `--print json`, or `--debug`. Try those first, and stop reading as soon as the blocking question is answered.

Never edit these files. They are the installed package, and an upgrade replaces them.

## Locate the source root

`siyuan-cli --help` prints `Skill root`, which ends in `skills/siyuan-cli`. Its grandparent is the source root:

```text
<skill root>/../..        e.g. .../@frostime/siyuan-cli/dist
```

The published package is unbundled: one small ESM module per concern, so a single file usually answers a single question.

## Code paths by question

| Blocking question | Read |
|---|---|
| Which workspace would this call select, and why that source? | `workspace/resolve.mjs` |
| How is `workspaceDir` turned into a base URL? | `workspace/resolver.mjs` |
| What does the global config accept? | `workspace/config.mjs`, `workspace/project-config.mjs` |
| Why did bind/confirm/unbind reach this state? | `workspace/binding/protocol.mjs` |
| What exactly does a rule match against? | `shared/permission.mjs` |
| Why was a request blocked, or a response filtered? | `api/guard.mjs`, `api/response-guards.mjs` |
| What payload does endpoint `<group>.<name>` accept? | `api/endpoints/<group>/<name>.mjs` |
| What does tool `<id>` actually do across calls? | `tool/builtins/<id>.mjs` |
| What is the exact `ToolContext` an extension receives? | `tool/registry.mjs` |
| Which error codes exist, and what exit code do they carry? | `shared/errors.mjs` |
| How is compact output built, and what does it omit? | `shared/output.mjs` |
| Why was a leading `/` path rewritten? | `api/msys-path.mjs` |
| How are extensions discovered, cached, and loaded? | `extension/loader.mjs`, `extension/cache.mjs` |

For exact TypeScript shapes used when authoring an extension, prefer the declarations in `shared/schema.d.mts` over reading `.mjs` implementations.

## Report what you find

If source reading reveals that a bundled resource is wrong, or that the CLI itself is at fault, say so explicitly rather than silently working around it. A wrong document or a missing `--help` field is a defect worth surfacing to the user.

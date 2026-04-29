---
revision: 2
date: 2026-04-29T02:24:01
trigger: "review-feedback"
---

# extension-guidance-cold-start

## Reason

Post-review discussion found that extension guidance is still too example-heavy for a cold-start agent. The main gap is not core functionality, but discoverability and workflow clarity:

- `siyuan extension --help` exposes only subcommand names, not the extension root, export contract, or the expected authoring workflow.
- `extension.md` documents examples and fallback mechanics, but does not yet present a compact authoring contract + cold-start workflow as the primary path.
- `skills/siyuan-cli/SKILL.md` points agents to docs and package-local references, but the extension workflow is still implicit rather than explicit.

The original spec/design predicted extension docs and help as broad capability areas, but not this stronger cold-start guidance layer. A revision is required because the user-visible help surface changes.

## Changes

### Spec Impact

Logical expansion of **Fix C: Documentation**:
- Add a cold-start workflow emphasis to extension guidance.
- Clarify package-local reference using the actual published package layout: docs in `src/docs/...`, runtime implementation in sibling `dist/...`.
- Improve `siyuan extension --help` so it serves as the first actionable entry point into the extension system.

### Design Impact

- `src/extension/command.ts` gains a custom extension help renderer for bare `siyuan extension -h`.
- `src/cli.ts` routes bare extension help through the new renderer, similar to the existing `api` / `tool` grouped help delegation.
- `src/docs/extension.md` is reorganized toward contract + workflow clarity rather than example-first explanation.
- `skills/siyuan-cli/SKILL.md` is tightened as an agent-facing operational index.

### Task Impact

Add feedback tasks for:
- `src/extension/command.ts` — implement enhanced extension help output
- `src/cli.ts` — delegate bare extension help to the new renderer
- `src/docs/extension.md` — add authoring contract + cold-start workflow emphasis
- `skills/siyuan-cli/SKILL.md` — reflect the clarified extension entry path
- regression verification for `siyuan extension -h`, `build`, and `typecheck`

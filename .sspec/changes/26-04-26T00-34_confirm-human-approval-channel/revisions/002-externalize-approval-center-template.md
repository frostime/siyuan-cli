---
revision: 2
date: 2026-04-26T15:05:44
trigger: "correction"
---

<!-- @RULE: trigger values: review-feedback | discovery | scope-expansion | correction
本文件记录 design gate 后的范围/设计变更。
spec.md 和 design.md 基线不可变，所有后续演化通过此类文件记录。
文件命名：revisions/NNN-description.md（编号递增）。 -->

# externalize-approval-center-template

## Reason
Real browser testing showed that keeping the Approval Center UI as one large inline HTML/JS template inside `src/approval/ui.ts` makes failures harder to inspect and fix. A recent syntax bug in the generated script kept the page stuck at `Loading...`, and debugging required extracting generated HTML back out of the TypeScript string.

The user asked to extract the HTML into a standalone file and load it at runtime with optional template-value substitution. This is a corrective change that improves inspectability and makes the UI behavior predictable under manual browser testing.

## Changes

### Spec Impact
No change to the user-visible feature promise. The Approval Center remains a built-in local page served by the broker.

The implementation constraint changes:
- Approval Center markup/script SHOULD live in a standalone HTML template file instead of an inline TypeScript string.
- The broker MAY inject a small set of runtime values into that template before serving it.

### Design Impact
`src/approval/ui.ts` should stop constructing a giant HTML string directly.

New design direction:
- Add a template file such as `src/approval/approval-center.html`
- `ui.ts` becomes a small loader/renderer that reads the template and replaces explicit placeholders such as the approval token
- Packaging/build flow must copy the HTML asset into `dist/approval/` so runtime loading works in both dev and packaged layouts

This improves debuggability and lets manual browser inspection operate on a real HTML artifact.

### Task Impact
Add a follow-up task to:
- move Approval Center markup/script into a standalone HTML file
- implement template loading/substitution in `src/approval/ui.ts`
- ensure the HTML asset is copied during build/publish
- re-run browser-based approval testing against the extracted template

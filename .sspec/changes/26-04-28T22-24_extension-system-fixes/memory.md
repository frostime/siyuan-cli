# Memory: extension-system-fixes

**Updated**: <!-- ISO timestamp, minute precision -->

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `feat/extension`
- HEAD: `ea02ddae71756244118bd219ff06a53861033a22`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## feat/extension
```

## State
**Phase**: Review
**Status**: Revision 004 implemented. Pending user review.

## Key Files
<!-- 对理解/继续这个 change 至关重要的文件
- `path/file` — what it contains, why it matters -->

## Knowledge
<!-- 不属于 spec/design/tasks/revisions 的独有信息。
只放 spec/design 没覆盖的：被否决的方案、隐性知识、用户偏好、"这个 API 有坑"。
格式：- [timestamp] [Type] content
Types: Decision, Constraint, Gotcha, Rejected
项目级发现 → ALSO append to project.md Notes。
过时项标注时间戳，不要静默删除。 -->

## Milestones
- 2026-04-28T22:24+08:00 Change created
- 2026-04-28T22:24+08:00 Design finalized (Fix A: init.ts only; Fix B: custom grouped help; Fix C: docs)
- 2026-04-28T22:45+08:00 T1–T10 implementation complete — build, typecheck, and all verifications pass
- 2026-04-28T23:10+08:00 Revision 001 implemented: callEndpointRaw signature changed to path-driven; extension.md + SKILL.md updated with source bootstrapping guidance; T11–T16 complete
- 2026-04-29T02:35+08:00 Revision 002 implemented: enhanced `siyuan extension -h`, added authoring contract + cold-start workflow, corrected package-local `dist/...` references; T17–T21 complete
- 2026-04-29T14:18+08:00 Revision 003 accepted from review: restore API extension schema-validation parity and add EndpointSchema spec-doc
- 2026-04-29T14:19+08:00 T22–T25 complete — `registerExtension()` now validates endpoint schemas, new spec-doc written, `pnpm test` and `pnpm run build` pass
- 2026-04-29T15:41+08:00 Revision 004 accepted from review: add explicit cache guidance on unknown extension commands
- 2026-04-29T15:50+08:00 T26–T29 complete — pending extension counter added, CLI unknown-command hint implemented, regression test added, `pnpm test` and `pnpm run build` pass

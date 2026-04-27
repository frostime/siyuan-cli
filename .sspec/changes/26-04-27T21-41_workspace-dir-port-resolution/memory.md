# Memory: workspace-dir-port-resolution

**Updated**: 2026-04-27T22:15

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `main`
- HEAD: `3fa1293b3dba574089a31f9913f9fb37ccf07f72`
- Worktree: `clean`
- Status Snapshot: raw `git status --short --branch` output

```text
## main...origin/main
```

## State
Implementation complete. All 8 tasks done. Awaiting user review.

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

Implementation complete. All 8 tasks done.
- Code: resolver.ts (new), config.ts (async resolveWorkspace + workspaceDir), command.ts (add --workspace-dir), api/command.ts (await), tool/registry.ts (await)
- Docs: 6 files updated
- Tests: 57/57 pass
Awaiting user review (@align gate).

## Key Files
<!-- 对理解/继续这个 change 至关重要的文件
- `path/file` — what it contains, why it matters -->
- `src/workspace/resolver.ts` — port resolution engine (5-step algorithm + cache re-verify)
- `src/workspace/config.ts` — WorkspaceEntry.workspaceDir + async resolveWorkspace/resolveEffectiveWorkspace
- `src/workspace/command.ts` — add --workspace-dir; await-ify all resolveWorkspace calls

## Knowledge
<!-- 不属于 spec/design/tasks/revisions 的独有信息。
只放 spec/design 没覆盖的：被否决的方案、隐性知识、用户偏好、"这个 API 有坑"。
格式：- [timestamp] [Type] content
Types: Decision, Constraint, Gotcha, Rejected
项目级发现 → ALSO append to project.md Notes。
过时项标注时间戳，不要静默删除。 -->
- [2026-04-27T22:25] [Decision] Async boundary moved down: workspace selection stays sync; only `materializeWorkspace()` performs IO.
- [2026-04-27T22:25] [Rejected] TTL cache for workspaceDir->baseUrl was dropped because single-shot CLI invocations get little value from cross-call caching.

## Milestones
<!-- 每 session 一行，纯事实记录；新记录直接追加
CLI 会把最后一条有效 bullet 视为 latest milestone
- [ISO timestamp] 一句话概要 -->
- [2026-04-27T22:15] Implementation complete: 5 code files + 6 docs updated, 57/57 tests pass
- [2026-04-27T22:25] Revision 001 applied: split resolve/materialize model, removed TTL cache, typecheck clean

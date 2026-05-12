# Memory: brute-edit-overwrite

**Updated**: 2026-05-12T23:30+08:00

## Git Baseline (Immutable)
<!-- Captured during `sspec change new` before any change files are written.
This section records the change starting point in git and MUST NOT be edited or refreshed later. -->

- Captured: before change file creation
- Repository: `H:/SrcCode/playground/siyuan-cli`
- Branch: `feat/优化内置工具`
- HEAD: `4e9d532dac24f2eeb76d46737a83811b343d652d`
- Worktree: `dirty`
- Status Snapshot: raw `git status --short --branch` output

```text
## feat/优化内置工具
M  README.md
?? chat-thread-export.xml
```

## State

Implementation complete; ready for user review. Tool behavior, tests, docs, build, typecheck, and CLI help verification passed. Follow-up corrections removed the over-general `longAliases` design and added Smallest Safe Edit Surface guidance.

## Key Files

- `src/tool/builtins/brute-edit.ts` — document-level replacement tool now supports `--overwrite <source>`.
- `src/tool/builtins/get-block-content.ts` — read tool now supports bodyOnly output via `--bodyOnly true`.
- `src/tool/builtins/index.ts` — builtin tool registration; `push-md` removed.
- `tests/tool-write-tools.test.ts` — source parsing tests updated for overwrite; push-md normalization tests removed.

## Knowledge

- [2026-05-12T22:59+08:00] [Decision] `brute-edit --overwrite` should be a string data source itself (`@file`, `@stdin`, literal), not a boolean plus separate `--data`.
- [2026-05-12T22:59+08:00] [Rejected] `push-md --overwrite` is not the recommended overwrite path because it deletes and re-imports, changing doc ID and creating a non-atomic failure window.
- [2026-05-12T23:18+08:00] [Rejected] `CliBehavior.longAliases` / `--body-only` support was removed as YAGNI; use direct schema field flag `--bodyOnly` instead.
- [2026-05-12T23:30+08:00] [Decision] Agent guidance should use the principle “Smallest Safe Edit Surface”: prefer block-level APIs for small localized edits; consider `brute-edit` only for broad/complex text-level rewrites where block-level edits are fragile or inefficient; always `--check true` first.

## Milestones

- [2026-05-12T22:59+08:00] Created sspec change and began code implementation.
- [2026-05-12T23:08+08:00] Completed implementation and verification.
- [2026-05-12T23:18+08:00] Removed over-general longAliases design and reverified.
- [2026-05-12T23:30+08:00] Updated guidance/help examples for Smallest Safe Edit Surface and reverified.

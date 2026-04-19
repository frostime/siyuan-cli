---
change: "p3-tool-skill"
change-type: single
updated: "2026-04-17"
---

# Tasks · P3: Tool + Skill

## Phase 1: Tool Runtime
- [x] T1.1 新建 `src/core/tools.ts`（registry + runner + output policy）
- [x] T1.2 新建 `src/commands/tool.ts`（tool list / describe / <id>）
- [x] T1.3 新建 `src/tools/index.ts`（注册所有 builtin tool）

**Verify**: `siyuan tool list` 有输出；`siyuan tool <id> --help` 可用。

---

## Phase 2: MVP Tools
- [x] T2.1 `src/tools/list-doc-tree.ts`
- [x] T2.2 `src/tools/list-dailynote.ts`
- [x] T2.3 `src/tools/append-content.ts`
- [x] T2.4 `src/tools/resolve-path.ts`

**Verify**: 4 个 tool 至少 dry-run/真实读操作可通；`resolve-path` 能查到真实 path。

---

## Phase 3: Skill Runtime
- [x] T3.1 新建 `src/core/skills.ts`（list/read/install）
- [x] T3.2 新建 `src/commands/skill.ts`（skill list / read / install）
- [x] T3.3 在 `src/cli.ts` 注册 tool / skill 命令

**Verify**: `siyuan skill list`、`siyuan skill read siyuan-cli`、`siyuan skill install siyuan-cli --dry-run` 可用。

---

## Phase 4: Builtin Skill Content
- [x] T4.1 `skills/siyuan-cli/SKILL.md`
- [x] T4.2 `skills/siyuan-cli/references/sql-cheatsheet.md`
- [x] T4.3 `skills/siyuan-cli/references/block-types.md`
- [x] T4.4 `skills/siyuan-cli/references/common-workflows.md`
- [x] T4.5 `skills/siyuan-cli/references/error-codes.md`

**Verify**: install 后目标目录文件完整，SKILL.md frontmatter 合规。

---

## Progress

**Overall**: 15 / 15 tasks ✅

| Phase | Done | Total | Status |
|-------|------|-------|--------|
| P1: Tool Runtime | 3 | 3 | ✅ |
| P2: MVP Tools | 4 | 4 | ✅ |
| P3: Skill Runtime | 3 | 3 | ✅ |
| P4: Builtin Skill Content | 5 | 5 | ✅ |

**Recent**: [2026-04-17] P3 implementation completed; tool/skill commands and builtin assets verified

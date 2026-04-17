---
change: "p4-polish"
change-type: single
updated: "2026-04-17"
---

# Tasks · P4: Polish

## Phase 1: tokenSource
- [x] T1.1 `src/core/config.ts` 支持 `tokenSource: env | file | command`
- [x] T1.2 `src/commands/workspace.ts` 输出 `tokenSource` 信息（不泄露 token）

## Phase 2: skill polish
- [x] T2.1 `src/core/skills.ts` 支持多 target + 模板变量替换
- [x] T2.2 `src/commands/skill.ts` 新增 uninstall
- [x] T2.3 实测 install/uninstall 到临时目标

## Phase 3: api debug
- [x] T3.1 `src/core/guard.ts` / `src/commands/api.ts` 打印 curl-like debug preview
- [x] T3.2 实测 `api query.sql --debug`

## Progress

**Overall**: 7 / 7 tasks ✅

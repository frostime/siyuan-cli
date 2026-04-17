---
name: p4-polish
status: DONE
change-type: single
created: 2026-04-17 12:20:00
reference:
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/06-module-skill.md
  type: doc
  note: skill install target、模板变量替换、uninstall
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/03-module-workspace.md
  type: doc
  note: tokenSource 设计
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/08-roadmap.md
  type: doc
  note: M6/M7 polish 收尾项
---

# P4: Polish

## Problem Statement

当前 CLI 已可用，但还有几个高价值收尾项能显著提升真实使用体验：
- workspace token 仍只支持明文字段
- skill install 缺 uninstall、多 target、模板变量替换
- api `--debug` 尚未输出 curl 等价命令

## Done 标准

- workspace 支持 `tokenSource: env | file | command`
- `siyuan skill uninstall` 可用；install 支持 `agents/claude/claude-project/custom`
- skill install 时替换基础模板变量：`{{cli_version}}` `{{workspace}}` `{{base_url}}` `{{cli_path}}` `{{today}}`
- `siyuan api <id> --debug` 会把 curl-like 预览打印到 stderr

## Scope Summary

| Area | Change |
|------|--------|
| `src/core/config.ts` | tokenSource 解析 |
| `src/commands/workspace.ts` | add/show 对 tokenSource 友好 |
| `src/core/skills.ts` | install target、模板变量、uninstall |
| `src/commands/skill.ts` | uninstall 命令 |
| `src/core/guard.ts` / `src/core/client.ts` | debug curl preview |

## Design Reference

见 `design.md`

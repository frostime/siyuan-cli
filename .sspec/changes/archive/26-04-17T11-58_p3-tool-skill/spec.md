---
name: p3-tool-skill
status: DONE
change-type: single
created: 2026-04-17 11:58:00
reference:
- source: .sspec/changes/archive/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/05-module-tool.md
  type: doc
  note: ToolSchema、输出契约、MVP tool 清单
- source: .sspec/changes/archive/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/06-module-skill.md
  type: doc
  note: Skill 结构、skill install/list/read 设计
- source: .sspec/changes/archive/26-04-17T01-57_p2-api-layer
  type: sub-change
  note: API Layer + Permission Engine baseline
archived: '2026-04-18T01:18:49'
---
# P3: Tool + Skill

## Problem Statement

P2 提供了 kernel API 直通能力，但 Agent 仍需要自己拼 workflow，使用成本偏高。P3 目标：提供 Tool 层封装和 Skill 分发，让 Agent 可以通过少量高层命令完成常见任务，并能安装内置 Skill 学会使用 `siyuan-cli`。

**Done 标准**：
- `siyuan tool list` / `describe` / `<id>` 可用
- 至少 4 个 MVP tool 可用：`list-doc-tree`、`list-dailynote`、`append-content`、`resolve-path`
- Tool 输出遵循 `{ content, details }` 契约，默认 stdout 只打印 `content`
- `siyuan skill list` / `read` / `install` 可用
- 内置 `skills/siyuan-cli/` 打包进 npm files，并能安装到 `~/.agents/skills/`

## Approach

建立与 API 层对称的 Tool / Skill 两套 registry + command：

1. **Tool layer**：schema registry、执行器、输出格式控制、4 个 MVP tool
2. **Skill layer**：builtin skill 目录、读取/列举/安装、模板变量替换
3. **Permission integration**：Tool 默认通过 `ctx.callEndpoint` 走 P2 权限引擎

## Scope Summary

| Area | Change |
|------|--------|
| `src/tools/*` | ToolSchema 与 4 个 MVP tool 落库 |
| `src/commands/tool.ts` | `tool list / describe / <id>` |
| `src/commands/skill.ts` | `skill list / read / install` |
| `src/core/tools.ts` | Tool registry + ToolContext |
| `src/core/skills.ts` | skill list/read/install runtime |
| `skills/siyuan-cli/` | builtin skill + references |
| `package.json` | 确认 `skills/**` 已打包 |
| `src/cli.ts` | 注册 tool / skill 命令 |

## Design Reference

见 `design.md`（Tool 输出契约、Skill 目录结构、install 行为、模板变量替换）

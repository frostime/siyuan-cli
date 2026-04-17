# Memory · P3: Tool + Skill

## State

REVIEW. P3 实现完成，等待用户 review。

## Key Files

- `reference/siyuan-cli-design/05-module-tool.md` — ToolSchema、输出契约、MVP tool 设计
- `reference/siyuan-cli-design/06-module-skill.md` — Skill 结构、install 目标、模板变量
- `src/core/schema.ts` — ToolSchema / ToolResult / ToolContext 类型定义

## Knowledge

- [2026-04-17T11:58] [Decision] P3 优先做 builtin tool + builtin skill；用户自定义 tool/skill 延后
- [2026-04-17T11:58] [Decision] skill install 目标先实现 `agents` 和 `custom`；其余 target 放到后续版本
- [2026-04-17T11:58] [Constraint] Tool 默认通过 `ctx.callEndpoint` 走 P2 权限引擎，不允许绕过
- [2026-04-17T12:12] [Decision] `tool` 命令与 `api` 一样采用动态 subcommands，并通过 `showUsage` 输出 schema-based help
- [2026-04-17T12:13] [Decision] builtin skill 目录采用 `skills/siyuan-cli/`，安装目标先支持 `~/.agents/skills/` 与 `custom`
- [2026-04-17T12:14] [Decision] `append-content` 的 `--dry-run` 通过底层 endpoint dry-run 预览，不实际写入

## Milestones

- [2026-04-17T11:58] Plan: P3 change created, ready for implementation
- [2026-04-17T12:14] Implement: tool runtime / 4 MVP tools / skill runtime / builtin skill content 完成
- [2026-04-17T12:15] Verify: `tool list` ✅, `tool list-doc-tree --help` ✅, `tool resolve-path --id <real-id>` ✅, `tool list-dailynote` ✅, `skill list` ✅, `skill read siyuan-cli` ✅, `skill install siyuan-cli --dry-run` ✅, `skill install siyuan-cli --force` ✅, `pnpm typecheck` ✅, `pnpm build` ✅

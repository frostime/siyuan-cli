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
- [2026-04-17T12:33] [Review-Feedback] 用户指出 `append-content` / `list-dailynote` 逻辑不符合参考实现；已对照 `sy-f-misc` 修正
- [2026-04-17T12:33] [Decision] `append-content` 现在在 `dailynote` 模式下会调用 `filetree.createDailyNote` 获取/创建今日日记，再调用 `block.appendBlock`
- [2026-04-17T12:33] [Decision] `list-dailynote` 改为参考实现风格：支持 `atDate` / `beforeDate` / `afterDate` / `notebookId`，默认查询当天

## Milestones

- [2026-04-17T11:58] Plan: P3 change created, ready for implementation
- [2026-04-17T12:14] Implement: tool runtime / 4 MVP tools / skill runtime / builtin skill content 完成
- [2026-04-17T12:15] Verify: `tool list` ✅, `tool list-doc-tree --help` ✅, `tool resolve-path --id <real-id>` ✅, `tool list-dailynote` ✅, `skill list` ✅, `skill read siyuan-cli` ✅, `skill install siyuan-cli --dry-run` ✅, `skill install siyuan-cli --force` ✅, `pnpm typecheck` ✅, `pnpm build` ✅
- [2026-04-17T12:34] Verify-Fix: `tool list-dailynote --atDate 2026-04-17` ✅, `tool append-content --targetType document --dry-run` ✅, `tool append-content --targetType dailynote --dry-run` ✅

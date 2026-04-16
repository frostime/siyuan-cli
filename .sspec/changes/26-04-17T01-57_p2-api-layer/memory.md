# Memory · P2: API Layer

## State

REVIEW. P2 实现完成，等待用户 review。

## Key Files

- `reference/siyuan-cli-design/04-module-api.md` — EndpointSchema 规范、argv→payload、--help 生成、22个endpoint清单
- `reference/siyuan-cli-design/07-module-permission.md` — 三段论权限架构全文
- `src/core/schema.ts` — EndpointSchema / GuardSpec 类型定义（已落库）
- `src/commands/api.ts` — `api list / describe / help / <id>` 手动分发实现
- `src/apis/index.ts` — 22 个 endpoint schema 的统一注册表入口

## Knowledge

- [2026-04-17T01:57] [Decision] output: 直接输出 response.data（不包 wrapper），失败走 stderr JSON
- [2026-04-17T01:57] [Constraint] 极简 jsonpath 自实现（不引入库），只支持 `field.sub` 和 `field[*]`
- [2026-04-17T01:57] [Constraint] @stdin 同一次调用只能出现一次，否则报错
- [2026-04-17T01:57] [Constraint] allowSource 未声明的字段只允许字面值（安全默认）
- [2026-04-17T02:08] [Decision] filetree endpoint identity 以真实 kernel 为准：`filetree.renameDoc` / `filetree.removeDoc`
- [2026-04-17T02:08] [Discovery] reference 设计文档中的 `renameDocByID` / `removeDocByID` 与 SDK schema 不一致，已通过 revision/001 记录
- [2026-04-17T02:18] [Discovery] Citty 的 `runMain()` 会全局拦截 `--help`，直接走 `resolveSubCommand()` + `showUsage()`
- [2026-04-17T02:25] [Decision] `api` 改为动态 subcommands：每个 endpoint id（如 `query.sql`）注册为真实 subcommand
- [2026-04-17T02:25] [Decision] 在 `src/cli.ts` 通过 `runMain({ showUsage })` 接管 endpoint subcommand 的帮助输出，恢复 `siyuan api <id> --help`
- [2026-04-17T02:22] [Decision] `--dry-run` 在无 workspace 场景也可工作，优先显示 `{ dryRun, endpoint, payload }` 预览

## Milestones

- [2026-04-17T01:57] Plan: tasks.md 完成，开始实现
- [2026-04-17T02:08] Revision: 发现 filetree endpoint 命名漂移，已对齐到真实 kernel naming
- [2026-04-17T02:22] Implement: 22 个 endpoint schema + registry + permission + argv + api command 完成
- [2026-04-17T02:26] Polish: `api` 从手动分发重构为动态 subcommands，恢复 `siyuan api <id> --help`
- [2026-04-17T02:26] Verify: `pnpm build` ✅, `api list`=22条 ✅, `api describe query.sql` ✅, `api query.sql --help` ✅, `api query.sql "SELECT 1" --dry-run` ✅

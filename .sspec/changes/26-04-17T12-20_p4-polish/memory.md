# Memory · P4: Polish

## State

REVIEW. P4 implementation completed.

## Key Files

- `reference/siyuan-cli-design/03-module-workspace.md`
- `reference/siyuan-cli-design/06-module-skill.md`
- `reference/siyuan-cli-design/08-roadmap.md`

## Knowledge

- [2026-04-17T12:20] [Decision] P4 聚焦高价值收尾：tokenSource、skill polish、api debug
- [2026-04-17T12:27] [Decision] skill install target 支持 `agents` / `claude` / `claude-project` / `custom`
- [2026-04-17T12:27] [Decision] SKILL.md 内加入模板变量占位符，install 时进行文本替换
- [2026-04-17T12:27] [Decision] `api --debug` 输出 endpoint、payload、curl-like preview 到 stderr

## Milestones

- [2026-04-17T12:20] Plan: P4 change created and implementation started
- [2026-04-17T12:27] Implement: tokenSource、skill uninstall/targets/template vars、api debug preview 完成
- [2026-04-17T12:28] Verify: `pnpm typecheck` ✅, `pnpm build` ✅, `api query.sql --debug` ✅, `skill install/uninstall custom` ✅, `workspace add --token-env` ✅

---
revision: 1
date: 2026-04-18T02:09:25
trigger: "review-feedback"
---

# contract hardening and tests

## Reason
在 P1 实现完成后的 review 中，发现几处会影响“契约冻结”可靠性的缺口：

1. `PermissionEngineLike.checkDeny` 的接口签名与实现不一致，造成契约文档失真。
2. registry 在 schema 既无 `classification` 也无 legacy `tags` 时会静默默认，缺少 fail-loud 保护。
3. P1 缺少最小 contract tests，无法为 P2/P3 提供稳定回归网。
4. heuristic 在 workspace surface 下会把 `path` 误当成 content path，导致未迁移 `file.*` endpoint 无法正确命中 workspace 规则。

这些反馈仍属于 P1 的验收范围，但已经超出初版 spec/design 对最终代码的预测精度，因此按 amend 处理并记录 revision。

## Changes

### Spec Impact
P1 的验收标准补强为：

- 契约接口必须与实现一致，不能保留对外撒谎的 interface。
- registry 必须对“无 classification 且无 legacy tags”的 schema fail loud。
- P1 必须补上一组最小 contract tests，覆盖 registry / permission / guard 的关键分支。
- workspace surface-aware heuristic 作为 P1 期间的重要兜底修复纳入验收，而不是仅记为已知缺口。

### Design Impact
P1 的 design 实际上新增/收紧了以下约束：

- `PermissionEngineLike` 公共接口收敛，`checkDeny` 退回实现细节。
- registry validation 增加两条静态校验：
  - schema 必须声明 `classification` 或 legacy `tags`
  - `payloadTargets.field` 必须存在于 `payload.properties`
- heuristic payload guard 允许参考 endpoint surface，在 `surface=workspace` 时把 `path` 解释为 `workspace-path`。
- 测试策略从 smoke-only 升级为：smoke + targeted contract tests。

### Task Impact
- 新增 review feedback 任务：修正 interface 契约、补 fail-loud 校验、修 workspace heuristic、补最小 contract tests
- 更新验证步骤：除 `pnpm typecheck` / `pnpm build` / `node dist/cli.mjs api list` 外，新增 targeted test 命令

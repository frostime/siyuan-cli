---
revision: 1
date: 2026-04-17T02:40:18
trigger: "correction"
---

<!-- @RULE: trigger values: review-feedback | discovery | scope-expansion | correction
本文件记录 design gate 后的范围/设计变更。
spec.md 和 design.md 基线不可变，所有后续演化通过此类文件记录。
文件命名：revisions/NNN-description.md（编号递增）。 -->

# unify-config-path-to-home-dot-config-on-windows

## Reason
用户明确要求配置文件统一写入 `~/.config/siyuan-cli/config.yaml`，包括 Windows 环境。

当前实现使用了 Windows `%APPDATA%/siyuan-cli/config.yaml` fallback，导致实际写入位置与项目预期不一致。

## Changes

### Spec Impact
配置路径语义统一为：

- 默认：`~/.config/siyuan-cli/config.yaml`
- 若设置 `XDG_CONFIG_HOME`：`$XDG_CONFIG_HOME/siyuan-cli/config.yaml`
- 若设置 `SIYUAN_CLI_CONFIG`：按该显式覆盖路径/目录解析

Windows 不再使用 `%APPDATA%` fallback。

### Design Impact
`src/utils/paths.ts` 的路径解析逻辑改为跨平台统一使用 home `.config` 语义。
必要时将旧位置 `%APPDATA%/siyuan-cli/config.yaml` 自动迁移到新位置。

### Task Impact
- 修改 `src/utils/paths.ts`，移除 Windows APPDATA fallback
- 在配置加载/保存前执行一次迁移：旧文件存在且新文件不存在时，复制/移动到 `~/.config/siyuan-cli/config.yaml`
- 更新 P1/root memory 记录该路径语义修正


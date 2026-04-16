---
name: p1-foundation
status: DONE
change-type: single
created: 2026-04-17 01:36:00
reference:
- source: .sspec/changes/26-04-17T01-34_siyuan-cli
  type: root-change
  note: Root coordinator
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/02-architecture.md
  type: doc
  note: 分层架构 + 目录结构
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/03-module-workspace.md
  type: doc
  note: Workspace 模块设计
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/skeleton
  type: doc
  note: 骨架代码（schema.ts / package.json / tsconfig.json / bin/siyuan.mjs）
---

# P1: Foundation

## Problem Statement

项目目前只有空壳 `package.json` + `tsconfig.json`，无法运行。
P1 目标：跑通 M0（骨架）+ M1（Workspace 管理）两个里程碑，建立后续所有 phase 的基础设施。

**Done 标准**：
- `siyuan --version` 和 `siyuan --help` 有输出
- `siyuan workspace add/list/use/verify/remove/show` 全部可用
- 与真实思源实例对接，`verify` 返回版本号
- 错误场景（ECONNREFUSED / 401 / timeout）分类型报错

## Approach

直接从 `reference/siyuan-cli-design/skeleton/` 落库骨架，补全 commands/core/utils 三层。

核心约束（不在 design.md 重复，见引用文档）：
- 配置路径：`~/.config/siyuan-cli/config.yaml`（Windows 回落 `%APPDATA%`）
- 文件权限：Unix 下 chmod 0600
- workspace 优先级：`--workspace` > `$SIYUAN_CLI_WORKSPACE` > config `current`

## Key Changes

**Infra: 项目配置落库**
从 skeleton 复制 `package.json`（name=`siyuan-cli`）、`tsconfig.json`、`bin/siyuan.mjs`、`src/core/schema.ts`，安装依赖，打通构建链路。

**New: `src/core/config.ts`**
读写 `config.yaml`，含 schemaVersion 迁移占位。

**New: `src/utils/paths.ts`**
XDG / Windows `%APPDATA%` 跨平台配置目录解析。

**New: `src/core/client.ts`**
`SiyuanClient`：`call(endpoint, payload)` + `upload(endpoint, files)` + `ping()`。

**New: `src/commands/workspace.ts`**
add / list / use / verify / remove / show 六个子命令。

**New: `src/cli.ts`**
Citty 主入口，注册 workspace 命令，接入全局 flag。

## Scope Summary

| File | Change |
|------|--------|
| `package.json` | 替换为正式配置（name, scripts, deps） |
| `tsconfig.json` | 替换为 skeleton 版本（ESNext + Bundler） |
| `bin/siyuan.mjs` | 新建 shebang 入口 |
| `src/cli.ts` | 新建主入口 |
| `src/core/schema.ts` | 从 skeleton 落库（类型真源） |
| `src/core/config.ts` | 新建 |
| `src/core/client.ts` | 新建 |
| `src/commands/workspace.ts` | 新建 |
| `src/commands/index.ts` | 新建（命令注册汇总） |
| `src/utils/paths.ts` | 新建 |
| `src/utils/errors.ts` | 新建（结构化错误 + exit code） |

## Design Reference

见 `design.md`（接口契约 + 配置格式 + 错误码）。

# Project Context

<!-- This file is the stable identity layer for agents working on this project.
Read it first every session. Update Conventions + Notes via @memory. -->

**Name**: @frostime/siyuan-cli
**Description**: Agent-first CLI for SiYuan Note — workspace management, kernel API proxy, permission guardrails, workflow tools, and agent skill install.
**Repo**: https://github.com/frostime/siyuan-cli

## Tech Stack
- TypeScript (ESM-only, Node ≥ 20)
- citty — CLI framework (subcommands, flags, help)
- ajv + ajv-formats — JSON Schema validation (payload & config)
- yaml — config file parsing
- micromatch — glob matching in permission rules
- tsdown — build; tsx — test runner; pnpm 10

## Key Paths
<!-- @RULE: Most important directories/files for quick navigation.
Keep ≤10 entries. Agent uses this to orient in the codebase. -->

| Path | Purpose |
|------|---------|
| `src/core/schema.ts` | 所有核心类型定义：EndpointSchema, ToolSchema, PermissionRule, RiskLabel, classification 等 |
| `src/core/config.ts` | 全局 config (~/.config/siyuan-cli/config.yaml) 加载、workspace 解析链 |
| `src/core/registry.ts` | Endpoint 注册表：收集 EndpointSchema，派生 risk/tags/meta |
| `src/core/permission.ts` | Permission engine：rule-list 模型，两阶段评估 (caller → resource) |
| `src/core/guard.ts` | 请求执行入口：payload 校验 → permission check → approval → kernel call → response filter |
| `src/core/tools.ts` | ToolRegistry + tool 执行逻辑，tool 通过 ToolContext 调用 endpoint |
| `src/apis/index.ts` | 所有 endpoint schema 的注册入口（import → registry.register） |
| `src/tools/index.ts` | 所有 tool schema 的注册入口 |
| `src/approval/` | Human-in-the-loop 审批：broker (HTTP server) + client + browser UI |
| `src/commands/` | CLI 子命令实现：api.ts, tool.ts, workspace.ts, doc.ts, skill.ts |

## Architecture Cheat-Sheet

调用链路 (agent 执行 `siyuan api <endpoint>`):
```
cli.ts → commands/api.ts → argv.ts (parse+validate payload)
  → guard.ts:executeEndpoint()
    → permission.ts (check rules)
    → approval/ (if effect=confirm or risk≥elevated)
    → client.ts:SiyuanClient.call() (HTTP POST to kernel)
    → guard.ts (response filter by permission)
    → output.ts (format: compact | json)
```

Tool 调用链路 (`siyuan tool <tool>`):
```
commands/tool.ts → core/tools.ts:ToolRegistry.execute()
  → tool.run(ctx) — ctx 提供 callEndpoint() 来间接走 guard 链路
```

Workspace 解析优先级：`--workspace` flag → `$SIYUAN_CLI_WORKSPACE` → `.siyuan-cli.yaml` → `config.current`

Permission 层级叠加：project (.siyuan-cli.yaml) > workspace > defaults

## Conventions
<!-- @RULE: Coding rules that apply across ALL work in this project.
One-liners only. If a convention needs multi-paragraph explanation → write a spec-doc. -->

- Endpoint 定义：一个文件一个 endpoint，导出 `schema: EndpointSchema`，放在 `src/apis/<group>/<name>.ts`
- Tool 定义：一个文件一个 tool，导出 `tool: ToolSchema`，放在 `src/tools/<name>.ts`
- 新增 endpoint/tool 后必须在对应 `index.ts` 中 import 并注册
- EndpointSchema.classification 是 authored truth；risk/tags/meta 由 registry 自动派生，不手写
- guard.payloadTargets 声明 payload 中哪些字段是 id/path/notebook，用于 permission 的 resource-level 检查
- format 函数提供 compact 输出；默认输出为 JSON
- Permission rule 中 notebook/path 只接受 ID-based 值，不接受 hpath
- .siyuan-cli.yaml 禁止包含 token/baseUrl/tokenSource/defaults，加载时 hard error
- 错误使用 CliError(ExitCode, code, message) 抛出，ExitCode 定义在 utils/errors.ts
- commit message 遵循 Conventional Commits + emoji prefix

## Spec-Docs Index
<!-- @RULE: Quick reference to formal specs in `.sspec/spec-docs/`.
Agent reads this to know what architecture knowledge exists before starting work.
Keep entries in sync with actual spec-doc files. Format: `- [name](spec-docs/<file>) — one-line description` -->

(none yet — create spec-docs with `sspec doc new "<name>"`)

## Notes
<!-- @RULE: Project-level memory. Append-only log of learnings, gotchas, preferences.
Agent appends here during @memory when a discovery is project-wide (not change-specific).
Format each entry as: `- YYYY-MM-DD: <learning>`
Prune entries that become outdated or graduate to Conventions/spec-docs. -->

- 2026-04-26: src/docs/ 和 skills/ 目录存放的是 bundled 文档和 agent skill 模板，不是代码；通过 `siyuan doc` 和 `siyuan skill install` 暴露给用户
- 2026-04-26: approval 模块是独立的 HTTP broker 进程，通过 localhost 端口与 CLI 主进程通信；browser UI 在 approval-center.html
- 2026-04-26: src/core/msys-path.ts 处理 MSYS/Git Bash 环境下的路径转换问题

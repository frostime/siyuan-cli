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
| `src/shared/schema.ts` | 所有核心类型定义：EndpointSchema, ToolSchema, PermissionRule, RiskLabel, classification 等 |
| `src/api/registry.ts` | Endpoint 注册表：收集 EndpointSchema，派生 risk/tags/meta，并做 registry-level schema 校验 |
| `src/api/guard.ts` | 请求执行入口：payload 校验 → permission check → approval → kernel call → response filter |
| `src/shared/permission.ts` | Permission engine：rule-list 模型，两阶段评估 (caller → resource) |
| `src/workspace/config.ts` | 全局 config (~/.config/siyuan-cli/config.yaml) 加载；同步 resolveWorkspace/resolveEffectiveWorkspace |
| `src/workspace/resolver.ts` | workspaceDir → runtime baseUrl 的本地解析器；materializeWorkspace 依赖它 |
| `src/tool/registry.ts` | ToolRegistry + tool 执行逻辑，tool 通过 ToolContext 调用 endpoint |
| `src/extension/` | extension 系统：discover/load/cache/init/CLI；用户扩展入口 |
| `src/api/endpoints/index.ts` | 所有 built-in endpoint schema 的注册入口（import → registry.register） |
| `src/{api,tool,workspace,doc,skill,extension}/command.ts` | CLI 子命令实现：api/tool/workspace/doc/skill/extension |

## Architecture Cheat-Sheet

### Module relationship map

```text
cli.ts
├─ workspace/command.ts   # 管理全局 workspace 配置 / verify / which / show
├─ api/command.ts         # 直接调用 endpoint
│  └─ api/guard.ts        # payload guard + permission + approval + response filter
│     └─ shared/client.ts # 最终 HTTP POST 到 SiYuan kernel
├─ tool/command.ts
│  └─ tool/registry.ts    # tool 通过 ToolContext 间接复用 api/guard 链路
└─ doc|skill|approval     # 辅助命令面
```

### Workspace resolution split

```text
config load
  → resolveWorkspace / resolveEffectiveWorkspace   # sync: 只决定“选中谁”
  → materializeWorkspace                          # async: 需要时把 workspaceDir 变成 concrete baseUrl
    → resolver.ts                                # 本地 getWorkspaces + conf.json + getConf 核验
```

### API 调用链路 (`siyuan api <endpoint>`)

```text
cli.ts → api/command.ts → shared/argv.ts (parse+validate payload)
  → workspace/config.ts (resolve workspace ref)
  → workspace/config.ts:materializeWorkspace()
  → api/guard.ts:executeEndpoint()
    → shared/permission.ts (check rules)
    → approval/ (if effect=confirm or risk≥elevated)
    → shared/client.ts:SiyuanClient.call() (HTTP POST to kernel)
    → api/guard.ts (response filter by permission)
    → shared/output.ts (format: compact | json)
```

### Tool 调用链路 (`siyuan tool <tool>`)

```text
tool/command.ts → tool/registry.ts
  → resolve workspace ref → materializeWorkspace()
  → tool.run(ctx) — ctx 提供 callEndpoint() 来间接走 guard 链路
```

Workspace 解析优先级：`--workspace` flag → `$SIYUAN_CLI_WORKSPACE` → `.siyuan-cli.yaml` → `config.current`

Permission 层级叠加：project (.siyuan-cli.yaml) > workspace > defaults

## Conventions
<!-- @RULE: Coding rules that apply across ALL work in this project.
One-liners only. If a convention needs multi-paragraph explanation → write a spec-doc. -->

- Endpoint 定义：一个文件一个 endpoint，导出 `schema: EndpointSchema`，放在 `src/api/endpoints/<group>/<name>.ts`
- Tool 定义：一个文件一个 tool，导出 `tool: ToolSchema`，放在 `src/tool/builtins/<name>.ts`
- 新增 endpoint/tool 后必须在对应 `index.ts` 中 import 并注册
- EndpointSchema.classification 是 authored truth；risk/tags/meta 由 registry 自动派生，不手写
- guard.payloadTargets 声明 payload 中哪些字段是 id/path/notebook，用于 permission 的 resource-level 检查
- format 函数提供 compact 输出；默认输出为 JSON
- Permission rule 中 notebook/path 只接受 ID-based 值，不接受 hpath
- .siyuan-cli.yaml 禁止包含 token/baseUrl/tokenSource/defaults，加载时 hard error
- 错误使用 CliError(ExitCode, code, message) 抛出，ExitCode 定义在 shared/errors.ts
- commit message 遵循 Conventional Commits + emoji prefix

## Spec-Docs Index
<!-- Quick reference to spec-docs in `.sspec/spec-docs/`.
Spec-docs capture knowledge that code alone cannot adequately convey:
  A) In code, but scattered or hard to reconstruct (cross-module architecture, UX requirements, design norms, trade-offs)
  B) Outside code entirely (platform rules, API quirks, business constraints, deployment assumptions)
NOT a restating of code behavior — if readable from code+comments, it doesn't belong here.
MUST keep entries in sync with actual spec-doc files.
Format: `- [name](spec-docs/<file>) — one-line summary`
create spec-docs with `sspec doc new "<name>"`
-->

- [EndpointSchema](spec-docs/endpoint-schema.md) — Authored contract for endpoint identity, classification/severity metadata, guard coupling, CLI semantics, output precedence, and cache boundaries
- [permission-model](spec-docs/permission-model.md) — Permission engine architecture: rule-list model, two-phase evaluation, rule cascade, project override semantics, unknown-field validation, and approval effect semantics
- [approval-broker](spec-docs/approval-broker.md) — Approval broker architecture: lazy-spawn process model, token IPC, state file layout, lifecycle policy, HTTP API, and browser UI
- [workspace-resolution](spec-docs/workspace-resolution.md) — Workspace resolution chain (flag → env → project-file → global-current), project-file discovery, permission override independence, workspaceDir port discovery, and IMPLICIT_WORKSPACE warning design
- [error-model](spec-docs/error-model.md) — Error model architecture: exit code semantics, error-to-exit mapping across modules, agent-side error handling contract, and framework warning catalog

## Notes
<!-- Project-level memory. Append-only log of learnings, gotchas, preferences.
Agent appends here during @memory when a discovery is project-wide (not change-specific).
Format each entry as: `- YYYY-MM-DD: <learning>`
Prune entries that become outdated or graduate to Conventions/spec-docs. -->

- 2026-04-26: src/docs/ 和 skills/ 目录存放的是 bundled 文档和 agent skill 模板，不是代码；通过 `siyuan doc` 和 `siyuan skill install` 暴露给用户
- 2026-04-26: approval 模块是独立的 HTTP broker 进程，通过 localhost 端口与 CLI 主进程通信；browser UI 在 approval-center.html
- 2026-04-26: src/api/msys-path.ts 处理 MSYS/Git Bash 环境下的路径转换问题
- 2026-04-29: EndpointSchema 的跨字段约束已沉淀到 `.sspec/spec-docs/endpoint-schema.md`；built-in 与 API extension 都应遵守同一套 registry-level 校验
- 2026-05-11: `README.md` 是给人看的项目介绍页，不应改成 Agent 路由页；Agent 路由应主要留在 `skills/siyuan-cli/SKILL.md` 和 `src/docs/README.md`

---
name: p1-core-contracts
status: DONE
change-type: single
created: 2026-04-18T01:28:56
reference:
  - source: ".sspec/changes/26-04-17T23-49_endpoint-tag-and-permission-model"
    type: "root-change"
    note: "Phase 1: Core Contracts"
  - source: ".sspec/changes/26-04-18T01-28_p1-core-contracts/revisions/001-contract-hardening-and-tests.md"
    type: "revision"
    note: "Review follow-up: contract hardening, workspace heuristic fix, and minimal tests"
  - source: ".sspec/changes/26-04-18T01-28_p1-core-contracts/revisions/002-array-payload-target-authorization.md"
    type: "revision"
    note: "Phase 6 prerequisite: add conservative array payload authorization support"
---

# P1: Core Contracts

## Problem Statement

当前代码仍运行在旧契约上：`EndpointTag` 是混轴数组、`guard.payload` 会覆盖多字段、`PermissionConfig.content` 读写不分、`id` 不会解析成 `{notebook, path}`。这些问题导致核心执行链在最危险的路径上缺乏真实保护。

P1 的目标是先冻结**共享契约**，让后续 P2/P3 可以在同一套规则下工作。若跳过这一步直接迁移 demo endpoint，会把接口设计、错误模型、配置语义、registry 元信息派生逻辑同时揉进 demo 改动里，review 成本会快速失控。

## Proposed Solution

### Approach

P1 只改**核心基础设施**，不在这一阶段推进大规模 endpoint schema 迁移。实现重点有五个：

1. `src/core/schema.ts` 定义新的 classification / payloadTargets / config-facing types
2. `src/core/registry.ts` 接收 authored schema，产出 normalized `RegisteredEndpoint.meta`
3. `src/core/permission.ts` + `src/core/guard.ts` 建立 async guard pipeline、bulk id resolver、错误分类、读写独立策略
4. `src/core/config.ts` 切到 config v2
5. `src/commands/api.ts` 等消费层改为读取 normalized meta

为避免 P1/P2 之间出现“新 contract 已落地，但其余未迁移 endpoint 全部编译失败”的问题，P1 会引入**临时兼容归一化桥**：registry 接受 legacy-tagged endpoint schema，并在注册时归一化为新的 `RegisteredEndpoint.meta`。这个桥只服务 P1→P3 过渡，P3 rollout 完成后移除。

### Key Change

**Contract A: Classification + Derived Meta**  
在 `src/core/schema.ts` 引入 `EndpointClassification`、`RiskLabel`、`DerivedMeta`、新的 `RegisteredEndpoint` 形状，并明确 `RegisteredEndpoint.meta` 是 CLI / permission / list / describe 的统一消费入口。

**Contract B: Guard Payload Contract**  
`GuardSpec.payload` 替换为 `payloadTargets[]`。guard 执行必须逐条检查每个 target，不允许再把多个字段折叠进单个 `{id,path,notebook}` slot。

**Contract C: Async Permission Pipeline**  
`PermissionEngine` 提供 `resolveContentIds()`、`checkContentRef()`、`checkTool()`，`executeEndpoint()` 改为 async payload guard → dry-run/confirm → request → response guard 的统一流程。

**Contract D: Config v2**  
`PermissionConfig` 切为 `content.read/write` + `workspace.read/write` + `endpoints` + `tools` + `confirm`。alpha 阶段允许 breaking reset，不做旧配置兼容迁移。

**Contract E: Transitional Registry Bridge**  
P1 增加 registry normalization：未迁移 endpoint 仍可用 legacy `tags` 注册，但 runtime 一律消费 normalized meta。该桥在 P3 后删除。

### Scope Summary

| File | Change |
|---|---|
| `src/core/schema.ts` | 新增 classification / derived meta / payloadTargets / config-facing core types |
| `src/core/registry.ts` | schema normalization、derived meta 派生、global read guard 静态校验、legacy shim |
| `src/core/config.ts` | config v2 结构、schemaVersion=2、alpha breaking reset |
| `src/core/permission.ts` | error taxonomy、bulk id resolver、tool/endpoint deny、读写独立策略 |
| `src/core/guard.ts` | async payload guard / response guard pipeline |
| `src/commands/api.ts` | 改为读取 normalized meta；write/invoke 判定改读 classification/risk |
| `src/core/tools.ts` | tool allow/deny 检查挂入 runtime context |
| `README.md` | 更新 config v2 与安全模型入口文档 |

### Design Reference

→ 详细技术设计见 [design.md](./design.md)

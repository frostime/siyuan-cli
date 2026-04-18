---
name: endpoint-tag-and-permission-model
status: REVIEW
change-type: root
created: 2026-04-17T23:49:57
reference:
  - source: ".sspec/changes/26-04-17T22-09_api-coverage-and-translation"
    type: "prev-change"
    note: "Follow-up: 在 API 覆盖基础上重构语义模型与权限基础设施"
---

# endpoint-tag-and-permission-model · Root Coordinator

## Problem Statement

当前 endpoint 语义与权限基础设施存在三个层级错位的问题，已经影响到安全边界的真实性与后续扩展的可维护性：

- **语义真源缺失**：`EndpointTag` 把 effect / risk / mechanism / action 混在同一数组里，下游消费者（CLI 列表、dry-run、确认逻辑）各自读取不同 tag 子集，无法共享统一判断依据。
- **payload guard 失效**：当前 `guard.payload` 在多字段同 kind 场景下会互相覆盖；更严重的是 `id` 从未解析成 `{notebook, path}`，所以所有“只传 id”的写操作都绕过了 path-prefix 级写范围限制。
- **权限表达力不足**：`PermissionConfig.content` 读写不分离，无法表达“可读不可写”的 notebook/path；`/api/file/*` 缺少独立 workspace 规则；tool 粒度缺少显式 allow/deny。

在 alpha 阶段，这类问题适合通过 breaking redesign 一次理顺。当前没有用户迁移成本，旧配置可直接删除重建。

## Proposed Solution

### Overall Approach

本 root change 不再试图在一个变更里同时完成“核心机制重构”和“全部 endpoint 批量迁移”。

改为三阶段推进：

1. **先冻结核心契约**：classification、payloadTargets、bulk id resolver、config v2、error taxonomy、confirm 语义、global endpoint 约束。
2. **再用代表性 API 组做 demo**：验证 content multi-id write、content single-id read、global read filter、workspace read/write、runtime invoke 高低风险两端。
3. **最后做批量 rollout**：按 API group 分批迁移剩余 endpoints/tools/docs/tests。

本 root 的设计约束有两条：

- **deny 是硬边界**，通过 endpoint/tool/content/workspace 规则强制执行。
- **confirm 是交互保险**，主要服务人类 CLI；在 agent 场景中通常会被 `--yes` 显式放行，因此不作为安全边界。

### Phase Overview

| Phase | Goal | Depends On | Sub-change |
|-------|------|-----------|------------|
| P1: Core Contracts | 冻结 classification / guard / permission / config / error 的共享契约 | — | TBD after gate |
| P2: Demo Adoption | 迁移 7 个代表性 endpoint（content read/write、global read、workspace read/write、runtime invoke），验证冻结契约在真实 schema 上的执行路径 | P1 | TBD after gate |
| P3: Rollout | 分批迁移剩余 `src/apis/**`、`src/tools/**`，补齐 docs/tests | P1, P2 | `26-04-18T03-11_p3-rollout` |

### Coordination Notes

- **P1 定稿后共享契约冻结**：`src/core/schema.ts`、`src/core/guard.ts`、`src/core/permission.ts`、`src/core/config.ts` 的接口在 P2 开始前冻结。P2/P3 只能消费。
- **P2 发现契约缺口时回到 P1 修订**：若 demo 暴露共享契约缺口，必须回到 P1 sub-change 追加修订并重新冻结，随后再继续 P2/P3。P2 不定义临时字段或私有扩展。
- **P2 是机制验收 phase**：只选少量代表性 endpoint 形成类别覆盖，避免在机制未稳时批量迁移 60+ schema 文件。
- **P3 是 rollout phase**：剩余 endpoints 的迁移以套用既定契约为主，但每个 endpoint 仍需逐个审视 payloadTargets / response guard。P3 至少更新 `README.md` 与 config examples；更大范围的 docs sweep 可另行组织。
- **alpha 阶段不做旧配置兼容迁移**：config 形状变化时允许直接 bump schemaVersion，并要求删除旧配置重建。

### Locked Decisions for Sub-changes

**Contract A: Classification is the single source of truth**  
endpoint schema 作者只手写 `classification`；`tags`、`risk`、`requiresConfirmation` 由 registry 派生。

**Contract B: Payload guard checks each target independently**  
`payloadTargets[]` 是 endpoint 输入权限映射的唯一声明形式。每一条独立检查，不再把多个字段压进单个 `{id,path,notebook}` slot。

**Contract C: ID-based access must resolve to notebook/path before policy check**  
`kind: "id"` 必须经过 resolver 转成 `{notebook, path}`，随后再落到 `content.read/write` 规则。

**Contract D: Global read endpoints rely on response guard**  
`query.sql`、`fullTextSearchBlock` 这类 `scope: "global"` 的 read endpoint 无法在 payload 阶段做资源级授权，必须在 response guard 阶段过滤。

**Contract E: Tool security stays simple in v1**  
当前 root 只引入 `tools.allow/deny` 与 endpoint guard 继承，不在 P1 引入额外 ToolCapability enforcement 模型。

### Design Reference

完整根设计、共享接口、phase 边界、非目标与验收矩阵见 [design.md](./design.md)

---
name: endpoint-tag-and-permission-model
status: PLANNING
change-type: single
created: 2026-04-17T23:49:57
reference:
  - source: ".sspec/changes/26-04-17T22-09_api-coverage-and-translation"
    type: "prev-change"
    note: "Follow-up: 在 API 覆盖基础上重构语义模型与权限基础设施"
---

# endpoint-tag-and-permission-model

## Problem Statement

当前 `EndpointTag` 系统存在三类独立缺陷，彼此叠加导致安全模型无法真正闭合：

**缺陷 A — 语义混轴**  
`"read" | "write" | "mutation" | "dangerous" | "upload" | "query"` 把 effect / risk / mechanism / action 四种语义维度混在单一数组里。`write` 与 `mutation` 边界模糊，`dangerous` 与其他 tag 不同轴，导致 tag 同时承担「CLI 过滤」「确认触发」「dry-run 判断」三个互相纠缠的职责。

**缺陷 B — Guard 参数映射失效**  
`guard.payload: Record<string, GuardFieldKind>` 有两个根本性问题：
1. 多个同 kind 字段（如 `moveBlock` 的 `id`/`previousID`/`parentID`）在 `applyPayloadGuard()` 中写入同一个 `item` slot，互相覆盖，只有最后一个被实际检查。
2. payload 中 `id` 类型字段从未被解析成 `{notebook, path}`，而 `checkDeny()` 检查的正是 `path` 和 `notebook`。结论：所有"只有 id"的写操作（`updateBlock`、`deleteBlock`、`moveBlock`、`removeDocByID` 等）**path-prefix 级写范围限制实际上无效**。

**缺陷 C — Permission config 读写不分离**  
`PermissionConfig.content` 只有单一规则集，同时控制读和写。无法表达「可以读某笔记本但不能写」的场景。缺少 workspace 文件路径级规则（`/api/file/*`）和 tool 粒度的 allow/deny。

## Proposed Solution

### Approach

用三层正交基础设施替代当前单一 tag 数组：

**层 1 — Classification（语义标签）**  
schema 作者填结构化字段 `classification: { mode, surface, scope, operation? }`，registry 注册时自动派生 `tags[]`、`risk` 摘要字符串、`requiresConfirmation` 布尔值。`mode` 直接映射到权限配置的读/写方向，使语义标签和安全策略共享同一份词表。

**层 2 — Guard（参数映射）**  
`guard.payload` 从 `Record<string, GuardFieldKind>` 改为 `payloadTargets: Array<{field, kind, access, when?}>`，每个字段独立一条，解决多字段覆盖问题，并明确每个字段的读/写方向。`kind: "id"` 时在 guard 执行阶段调用 `resolveContentId(id)` → `{notebook, path}`，使 path-prefix 写范围限制真正落地。response 侧保持现有两套机制（声明式 `response` + 命令式 `filterResponse`），接口不变。

**层 3 — Permission config（安全策略）**  
`PermissionConfig.content` 拆为 `content.read` / `content.write` 两段，分别配置 notebook 和 path 规则。新增 `workspace.read` / `workspace.write`（控制 `/api/file/*`）。新增 `tools` 粒度 allow/deny。`confirm` 改为可配置策略，基于 classification 矩阵推导确认需求。

### Key Change

**Type A: Classification Type System**  
新增 `EndpointClassification` 接口及相关枚举类型。`EndpointSchema` 新增 `classification` 字段，`tags` 字段变为 registry 派生的只读视图，schema 文件不再手写 `tags`。

**Type B: Guard payloadTargets**  
`GuardSpec.payload` 改名为 `payloadTargets`，类型从 `Record<string, GuardFieldKind>` 改为 `PayloadTargetSpec[]`。`applyPayloadGuard()` 改为逐条处理，每条独立调 `checkDeny()`。

**Type C: ID Resolver**  
`PermissionEngine` 新增 `resolveContentId(id: string): Promise<{notebook: string; path: string}>`，内部用 `query.sql` raw call，单次调用内缓存。Guard 执行时对 `kind: "id"` 字段触发此解析。

**Type D: Permission Config Read/Write Split**  
`PermissionConfig` 结构重组：`content` 拆为 `content.read` / `content.write`，新增 `workspace.read` / `workspace.write` 和 `tools`。配置 schema version bump（或保持兼容迁移）。

**Type E: Tool Capability**  
`ToolSchema` 新增 `capability?: ToolCapability`，声明 tool 可读/写的 surface 集合。tool allow/deny 通过 `tools` 配置控制，tool 内部每次 `callEndpoint()` 继续走完整 guard 链路（双层）。

**Type F: API Schema Migration**  
所有 `src/apis/**/*.ts` 文件：`tags` 改为 `classification`，`guard.payload` 改为 `guard.payloadTargets`。重点修复：`insertBlock`（补 payloadTargets）、`moveBlock`（三字段全部独立条目）、`file.putFile`（surface: workspace）、`system.exit`（surface: runtime）、`network.forwardProxy`（surface: network）。

### Scope Summary

| File | Change |
|---|---|
| `src/core/schema.ts` | 新增 `EndpointClassification`、`PayloadTargetSpec`、`ToolCapability` 类型；`GuardSpec.payload` → `payloadTargets`；`EndpointSchema` 新增 `classification` 字段 |
| `src/core/config.ts` | `PermissionConfig` 重组：content 读写分离，新增 workspace、tools 段 |
| `src/core/permission.ts` | `PermissionEngine` 新增 `resolveContentId()`、`checkTool()`；`requiresConfirmation()` 改为读 classification |
| `src/core/guard.ts` | `applyPayloadGuard()` 改为逐条处理 `payloadTargets`；触发 id resolver；接口改为 async |
| `src/core/registry.ts` | 注册时调用 `deriveClassificationMeta()` 派生 tags / risk / requiresConfirmation |
| `src/apis/**/*.ts`（全部，约 60 个文件） | `tags` → `classification`；`guard.payload` → `guard.payloadTargets` |
| `src/tools/*.ts`（4 个文件） | 新增 `capability` 字段 |
| `src/commands/api.ts` | `isWriteEndpoint()` 改为读 `classification.mode` |

### Design Reference

→ 详细技术设计见 [design.md](./design.md)

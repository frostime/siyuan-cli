---
name: siyuan-cli
status: DONE
change-type: root
created: 2026-04-17 01:34:45
reference:
- source: .sspec/requests/26-04-16T19-04_do-this-project.md
  type: request
  note: Original request
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design
  type: doc
  note: Pre-design documents (v2, 9 chapters + skeleton code)
- source: .sspec/changes/26-04-17T01-36_p1-foundation
  type: sub-change
  note: "Phase 1: Foundation (M0 skeleton + M1 workspace)"
- source: .sspec/changes/26-04-17T01-57_p2-api-layer
  type: sub-change
  note: "Phase 2: API Layer (M2 API + M3 permission)"
- source: .sspec/changes/26-04-17T11-58_p3-tool-skill
  type: sub-change
  note: "Phase 3: Tool + Skill (M4 tools + M5 skills)"
- source: .sspec/changes/26-04-17T12-20_p4-polish
  type: sub-change
  note: "Phase 4: Polish (tokenSource + skill polish + api debug)"
---

# siyuan-cli · Root Coordinator

## Problem Statement

Agent 在操作思源笔记时，只能通过原始 HTTP API 调用，缺乏：
- 统一的多工作空间认证管理
- 可自学的 `--help` 接口（Agent 无法自发现能做什么）
- 安全围栏（防止误操作、越权访问）
- 业务封装层（一次 Tool 调用替代 5 次 API 调用）

目标：构建一个 **Agent-first CLI**，让 Agent 装完 Skill 即可自学上手，所有命令 `-h` 自足可用，输出为机器可直接消费的 JSON。

## Proposed Solution

### Overall Approach

技术选型与核心决策已在 `reference/siyuan-cli-design/` 中完整讨论并定稿（v2）。此处只记录实际落地约束：

- **包名**：`siyuan-cli`（无 scope）
- **入口命令**：`siyuan`
- **包管理器**：`pnpm`
- **未决议拍板**（Q1-Q9 全部采纳推荐方案，见 `reference/siyuan-cli-design/09-open-questions.md`）

实现顺序遵循 `reference/siyuan-cli-design/08-roadmap.md` 的 M0→M7 里程碑，每个里程碑对应一个 sub-change。

### Phase Overview

| Phase | Goal | Depends On | Sub-change |
|-------|------|-----------|------------|
| P1: Foundation | M0+M1：骨架 + Workspace 管理可用 | — | 26-04-17T01-36_p1-foundation |
| P2: API Layer | M2+M3：API 直通 + 权限引擎 | P1 | 26-04-17T01-57_p2-api-layer |
| P3: Tool + Skill | M4+M5：Tool 层 + Skill 管理 | P2 | 26-04-17T11-58_p3-tool-skill |
| P4: Polish | M6+M7：补齐 API + 稳定化 | P3 | 26-04-17T12-20_p4-polish |

**Coordination Notes**：
- `src/core/schema.ts` 是全局类型锚，P1 定稿后 P2/P3 只 import，不重复定义
- 权限引擎（P2）是 Tool 层（P3）的前置依赖，Tool 必须通过 `ctx.callEndpoint` 走引擎
- P1 的 `SiyuanClient` 接口需在 P2 开始前冻结，P3 不得绕过

### Design Reference

核心类型定义（`EndpointSchema`、`ToolSchema`、`GuardSpec`、`deriveEndpointId`）已在
`reference/siyuan-cli-design/skeleton/src/core/schema.ts` 中定稿，P1 直接落库。

完整架构分层图见 `reference/siyuan-cli-design/02-architecture.md §2`。

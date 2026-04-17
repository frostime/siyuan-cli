---
change: "endpoint-tag-and-permission-model"
updated: 2026-04-17T23:49:41+08:00
---

# Memory: endpoint-tag-and-permission-model

## State

**Phase**: Design — @align gate（等待用户确认 spec + design）

**Last action**: spec.md + design.md 填写完毕，送专家审查

## Milestones

- [x] Clarify：完整讨论问题现状、需求逻辑、设计方向（~12 轮对话）
- [x] Design：spec.md + design.md 完成
- [ ] @align gate：待用户确认
- [ ] Plan
- [ ] Implement
- [ ] Review

## Knowledge

### 已确认决策

**D1. profiles.agent 去掉**  
权限系统无法区分调用者身份，权限配置按资源能力建模，不做 human/agent 分层。

**D2. Classification 必填三字段 + 一个选填**  
`mode` / `surface` / `scope` 必填，`operation` 选填。  
`risk` / `tags` / `requiresConfirmation` 全部派生，schema 作者不手写。

**D3. payloadTargets 数组替代 payload Record**  
每个字段独立一条，解决多字段覆盖问题（moveBlock bug）。  
`access: "read" | "write"` 明确每个字段的访问方向。

**D4. id resolver 用 SQL raw query**  
`SELECT box, path FROM blocks WHERE id = ? LIMIT 1`  
绕过 endpoint guard 直接调内核，单次调用内缓存。已确认（用户拍板）。

**D5. insertBlock / moveBlock 中所有 ID 字段均按 write 检查（从严）**  
已确认（用户拍板）。

**D6. content read/write 分离配置**  
`content.read` / `content.write` 分别配置 notebook 和 path 规则。  
新增 `workspace.read` / `workspace.write`（控制 `/api/file/*`）。

**D7. path 规则主键用 SiYuan `path`（ID-based，稳定）**  
不用 `hpath`。

**D8. Tool 双层权限检查**  
入口做 tool allow/deny，内部每次 `callEndpoint()` 继续走完整 guard 链路。

**D9. SQL response filter v1 保持现状**  
v1 继续走 response filter，subquery rewriting 作为 v2 可选优化。

**D10. guard 执行接口改为 async**  
因 id resolver 是异步 SQL 查询，`applyPayloadGuard()` 和 `executeEndpoint()` 变为 async。

### 设计中的开放点（未堵死，留给实现阶段决定）

- `getBlockKramdown` / `getBlockDOM` 的 response 是单个字符串，不可作为 items 过滤；  
  v1 只做 payload 检查（guard id → checkDeny path），内容本身不 filter。
- `confirm` 策略的默认值矩阵，可能在 plan 阶段进一步细化。
- tool `inputRefs`（条件激活的 payloadTargets）是否进 v1，待 plan 时决定。

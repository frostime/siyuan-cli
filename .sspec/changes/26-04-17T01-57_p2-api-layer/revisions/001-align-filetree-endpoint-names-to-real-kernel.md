---
revision: 1
date: 2026-04-17T02:07:43
trigger: "discovery"
---

<!-- @RULE: trigger values: review-feedback | discovery | scope-expansion | correction
本文件记录 design gate 后的范围/设计变更。
spec.md 和 design.md 基线不可变，所有后续演化通过此类文件记录。
文件命名：revisions/NNN-description.md（编号递增）。 -->

# align-filetree-endpoint-names-to-real-kernel

## Reason
在对接 `temp/siyuan-sdk/schemas/kernel/api/filetree/*` 时发现，真实 kernel endpoint 名称为：

- `/api/filetree/renameDoc`
- `/api/filetree/removeDoc`

而 reference 设计文档中写成了 `renameDocByID` / `removeDocByID`。

本项目已确定 `endpoint` 是唯一权威身份字段，因此实现必须以真实 kernel endpoint 为准。

## Changes

### Spec Impact
P2 的 filetree 写操作 endpoint 采用真实 kernel 名称：

- `filetree.renameDoc`
- `filetree.removeDoc`

相应 CLI id、权限规则匹配、registry 注册结果均以这两个 id 为准。

### Design Impact
无接口机制变化；仅修正 endpoint identity 的具体取值。
`endpoint` 唯一权威、`id` 自动派生的总体设计保持不变。

### Task Impact
- 将 `src/apis/filetree/renameDocByID.ts` 调整为 `src/apis/filetree/renameDoc.ts`
- 将 `src/apis/filetree/removeDocByID.ts` 调整为 `src/apis/filetree/removeDoc.ts`
- `src/apis/index.ts` 的注册项同步采用新名称
- 后续验证命令与权限规则示例均使用 `filetree.renameDoc` / `filetree.removeDoc`


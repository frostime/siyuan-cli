---
name: expose-missing-kernel-apis
created: 2026-05-07T13:00:54
status: OPEN
attach-change: null
tldr: "补充暴露有 Agent 价值的内核 API，并提供 raw API 透传调用方案"
---

<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this! -->

# Request: expose-missing-kernel-apis

## Background

对比内核 `router.go` 全量 API 与 CLI 已注册端点，发现大量有用 API 未被暴露。
源自对话：讨论 brute-edit 风险 → 盘点 CLI 能力边界 → 发现差集。

CLI 当前已注册约 60 个端点，内核实际提供约 200+。

## Problem

两个层面的问题：

**1. 具体缺失项（有 Agent 工作流价值的）**

| API | 用途 | 缺失影响 |
|-----|------|---------|
| `attr.batchGetBlockAttrs` | 批量读属性 | 现在要多次调用 `getBlockAttrs` |
| `attr.batchSetBlockAttrs` | 批量写属性（atomic） | 无法原子性批量写，中途失败不回滚 |
| `block.getBlockKramdowns` | 批量取 Kramdown | 多块读取要多次往返 |
| `block.batchInsertBlock` | 批量插入块 | 多块插入要串行多次 `insertBlock` |
| `block.batchAppendBlock` | 批量 append 块 | 同上 |
| `block.batchPrependBlock` | 批量 prepend 块 | 同上 |
| `block.getDocInfo` | 单文档元信息（含字数、子块数等） | 只能 SQL 绕路 |
| `block.getDocsInfo` | 批量文档元信息 | 同上 |
| `block.getTailChildBlocks` | 取文档末尾 N 个子块 | append 前确认上下文需 SQL |
| `block.getBlockSiblingID` | 取块的前后兄弟 ID | `moveBlock` 用 `previousID` 定位时无法直接拿 |
| `block.appendDailyNoteBlock` | 直接 append 到 daily note（无需先 resolve doc ID） | 现有 tool 已封装但绕了一圈 |
| `block.prependDailyNoteBlock` | 同上，prepend | 同上 |
| `filetree.duplicateDoc` | 文档复制 | CLI 对外说"不支持 copy"，实际内核有 |
| `filetree.getFullHPathByID` | 含笔记本名的完整 hpath | 现在 `getHPathByID` 不含笔记本前缀 |

**2. 结构性问题：无 raw 透传通道**

当内核新增 API 时，Agent 必须等 CLI 手动注册才能调用。
对于不常用或临时需要的 API，缺乏一个"不需要预先注册"的调用路径。

## Initial Direction

两条并行路径，可独立实施：

**路径 A：补充注册上述缺失端点**

和现有端点一样，写 `EndpointSchema`，走正常的 guard / permission 体系。
优先级建议（从高到低）：
1. `attr.batchGetBlockAttrs` / `batchSetBlockAttrs`
2. `block.getBlockKramdowns`
3. `block.batchInsertBlock` / `batchAppendBlock` / `batchPrependBlock`
4. `block.getBlockSiblingID`
5. `filetree.duplicateDoc`
6. `block.getDocInfo` / `getDocsInfo` / `getTailChildBlocks` / `getFullHPathByID`
7. `block.appendDailyNoteBlock` / `prependDailyNoteBlock`

**路径 B：raw API 透传命令**

提供一个不需要预注册的 fallback 通道，直接透传到内核 API：

```
siyuan api invoke-raw <endpoint> [-j <json>] [-f <json-file>]
```

（命令名 / UX 待讨论，以上仅为示例）

设计约束：
- 仍走 workspace 鉴权（token）
- 仍走 permission 检查（或至少有风险级别提示）（或者 workspace config 中对原始调用做额外许可配置，比如是否开启，或者只允许某些操作等）（由于没有 schema 配置，无法实现满血内置 API 检查）
- 不做 payload schema 校验（raw 的意义就是绕过 schema）
- 响应原样输出（不走 formatStrategy）
- 是否需要 `--yes` 强制确认待讨论

## Success Criteria

- [ ] Agent 可以批量读写属性，不需要多次调用
- [ ] Agent 可以批量创建块（insert / append / prepend）
- [ ] Agent 可以拿到块的 sibling ID 用于 moveBlock 定位
- [ ] Agent 可以复制文档（`duplicateDoc`）
- [ ] 存在一个 fallback 通道，当 Agent 需要未注册的内核 API 时可直接调用

## Relational Context

- 对话背景：从 brute-edit 安全性讨论延伸而来
- 相关代码：`src/api/endpoints/` — 现有端点注册方式
- 内核 API 文档：`API_zh_CN.md` in siyuan-note/siyuan repo
- 现有批量端点参考：`block.batchUpdateBlock`（已注册，可作为 batch 系列的实现参考）
- raw 透传方案需与 permission 体系对齐：`src/docs/cli-usage/permission.md`

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILL + `sspec change new --from <this>`.

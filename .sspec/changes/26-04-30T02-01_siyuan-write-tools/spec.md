---
name: siyuan-write-tools
status: PLANNING
change-type: single
created: 2026-04-30T02:01:37
reference:
  - source: ".sspec/changes/26-04-30T02-01_siyuan-write-tools/reference/findreplace-investigation.md"
    type: "doc"
    note: "findReplace kernel API investigation (excluded — global scope, not doc-scoped)"
  - source: ".sspec/changes/26-04-30T02-01_siyuan-write-tools/reference/import-md-chat.xml"
    type: "doc"
    note: "importStdMd kernel API research (used by push-md)"
  - source: ".sspec/changes/26-04-30T02-01_siyuan-write-tools/revisions/001-pre-implement-corrections.md"
    type: "revision"
    note: "5 behavioral corrections + 1 scope expansion; see revision for delta"
---

# siyuan-write-tools

## Problem Statement

CLI 当前 6 个 builtin tool 全部是 read/append 操作，没有内容编辑能力。Agent 修改文档的唯一路径是 `block.updateBlock` 逐块调用——agent 需自行完成"分块 → 匹配 → 逐块替换 → 验证"编排，冗长且易错。同时，缺少将本地 Markdown 文档（含图片）一键写入思源的 workflow 封装。

## Proposed Solution

### Approach

专题：**思源写入能力**。新增 2 个 builtin tool：

1. **`brute-edit` tool** — 文档级全文字符串替换。每个 search 必须恰好匹配 1 次（唯一性预检查），全部 all-or-nothing。安全门禁不通过直接拒绝并详细报错。`--dry-run` 预览。
2. **`push-md` tool** — 将本地 .md 文件推送到思源。底层调用内核 `importStdMd` API，自动处理图片/Base64/HTML img/文档间链接。`--overwrite` 覆盖时检查引用安全（有入站引用则拒绝）。`--dry-run` 预览。

### Key Change

**Tool A: `brute-edit`**
- 输入：`id` + `replacements`（JSON 数组）+ 可选 `maxSize` + `dryRun`
- **唯一性预检查**：每个 search 必须在原文中恰好出现 1 次。0 次或多次 → 全部拒绝
- **原文命中替换**：捕获原文中每个 search 的字节范围，按位置从后到前替换。后续替换不会误伤前一条生成的新文本。重叠范围 → 拒绝
- 安全门禁：子块无 custom-*、子块无入站 refs、size limit
- 写回：`block.updateBlock` 一步完成
- tags: `['write']`（risk 维度未承载，详见 revision 001 §8）

**Tool B: `push-md`**
- 输入：`sourcePath` + `notebook` + `toPath` + 可选 `--overwrite` / `--dry-run`
- 底层：内核 `importStdMd`（通过注册的 `import.importStdMd` endpoint schema，走 guard 链路）
- 内核自动处理：图片、Base64、HTML img、链接转换、YFM
- 创建模式：目标 hpath 已有文档 → 拒绝，提示使用 `--overwrite` 或 in-place 块编辑
- 覆盖模式：`--overwrite` → 仅当目标恰好一个文档且无入站引用（含子块）→ `removeDocByID` → import
- 多文档歧义：目标或父路径有多个文档 → 拒绝，要求调用方消歧
- 导入后通过 `filetree.getIDsByHPath` 定位新文档
- 限制：CLI 和内核须同机
- tags: `['write']`（功能子类未承载，详见 revision 001 §8）

### Scope Summary

| File | Change |
|------|--------|
| `src/api/endpoints/import/importStdMd.ts` | New: endpoint schema for `/api/import/importStdMd` |
| `src/api/endpoints/index.ts` | Add: register `import.importStdMd` |
| `src/tool/builtins/brute-edit.ts` | New: brute-edit tool |
| `src/tool/builtins/push-md.ts` | New: push-md tool |
| `src/tool/builtins/index.ts` | Modify: register brute-edit, push-md |
| `tests/endpoint-schemas.test.ts` | Add: importStdMd schema coverage |
| `tests/tool-write-tools.test.ts` | New: write-tool behavior tests |

### Design Reference

→ 详细技术设计见 [design.md](./design.md)
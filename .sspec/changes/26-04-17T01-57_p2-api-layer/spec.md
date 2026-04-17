---
name: p2-api-layer
status: DONE
change-type: single
created: 2026-04-17 01:57:00
reference:
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/04-module-api.md
  type: doc
  note: EndpointSchema 规范、argv→payload 映射、--help 生成、endpoint 清单
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/07-module-permission.md
  type: doc
  note: 三段论权限架构（Rules / Engine / Extractor）
- source: .sspec/changes/26-04-17T01-34_siyuan-cli/reference/siyuan-cli-design/skeleton/src/core/schema.ts
  type: code
  note: EndpointSchema / GuardSpec 类型定义（已落库）
---

# P2: API Layer

## Problem Statement

P1 只有 workspace 管理，无法直接调用 SiYuan kernel API。
P2 目标：实现 `siyuan api <id>` 直通调用，配套权限引擎，覆盖 22 个核心 endpoint。

**Done 标准**：
- `siyuan api list` 列出所有注册 endpoint
- `siyuan api query.sql -h` 输出完整帮助（含参数、示例、来源）
- `siyuan api query.sql "SELECT id FROM blocks LIMIT 5"` 可执行并返回 JSON
- `siyuan api describe <id>` 返回完整 EndpointSchema JSON
- 权限引擎：endpoint 级 + content 级（checkDeny / filterItems）
- 写保护：mutation/dangerous tag + guardWrite 配置触发 --yes/--dry-run
- 错误场景：endpoint 被禁 → exit 5；payload 验证失败 → exit 2；content 拒绝 → exit 5

## Approach

分三层独立实现，自底向上：

1. **Registry**：扫描 `src/apis/**/*.ts`，派生 id/group/name，导出 `Map<id, EndpointSchema>`
2. **Permission Engine**：读 config 的 permission 配置，实现 checkEndpoint / checkDeny / filterItems
3. **API Command**：Citty 动态子命令（call / list / describe），argv → payload 解析，guard 执行

## Scope Summary

| File | Change |
|------|--------|
| `src/core/registry.ts` | 新建：endpoint 注册表 + deriveEndpointId |
| `src/core/permission.ts` | 新建：PermissionEngine 实现 |
| `src/core/argv.ts` | 新建：argv → payload 解析 + input source 处理 |
| `src/core/guard.ts` | 新建：schema guard 执行（payload/response） |
| `src/commands/api.ts` | 新建：api call / list / describe 命令 |
| `src/cli.ts` | 修改：注册 api 命令 |
| `src/apis/query/sql.ts` | 新建：首个 endpoint schema |
| `src/apis/system/version.ts` | 新建 |
| `src/apis/system/bootProgress.ts` | 新建 |
| `src/apis/notebook/lsNotebooks.ts` | 新建 |
| `src/apis/notebook/createNotebook.ts` | 新建 |
| `src/apis/filetree/listDocsByPath.ts` | 新建 |
| `src/apis/filetree/createDocWithMd.ts` | 新建 |
| `src/apis/filetree/renameDoc.ts` | 新建 |
| `src/apis/filetree/removeDoc.ts` | 新建 |
| `src/apis/filetree/getHPathByID.ts` | 新建 |
| `src/apis/block/getBlockKramdown.ts` | 新建 |
| `src/apis/block/appendBlock.ts` | 新建 |
| `src/apis/block/insertBlock.ts` | 新建 |
| `src/apis/block/updateBlock.ts` | 新建 |
| `src/apis/block/deleteBlock.ts` | 新建 |
| `src/apis/attr/getBlockAttrs.ts` | 新建 |
| `src/apis/attr/setBlockAttrs.ts` | 新建 |
| `src/apis/search/fullTextSearchBlock.ts` | 新建 |
| `src/apis/export/exportMdContent.ts` | 新建 |
| `src/apis/asset/upload.ts` | 新建 |
| `src/apis/notification/pushMsg.ts` | 新建 |
| `src/apis/index.ts` | 新建：统一 re-export 所有 schema |

## Design Reference

见 design.md（接口契约 + guard 执行流程 + argv 解析规则）

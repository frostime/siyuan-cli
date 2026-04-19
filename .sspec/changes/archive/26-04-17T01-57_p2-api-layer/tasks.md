---
change: "p2-api-layer"
change-type: single
updated: "2026-04-17"
---

# Tasks · P2: API Layer

## Phase 1: Registry + Permission Engine

- [x] T1.1 新建 `src/core/registry.ts`（deriveEndpointId + EndpointRegistry 单例）
- [x] T1.2 新建 `src/core/permission.ts`（PermissionEngine：checkEndpoint / checkDeny / filterItems / requiresConfirmation）
- [x] T1.3 新建 `src/core/guard.ts`（executeEndpoint 流程 + 极简 jsonpath + heuristicPayloadGuard）

**Verify**: 直接 `node -e` 测试 deriveEndpointId + checkDeny 逻辑正确。

---

## Phase 2: argv → payload 解析

- [x] T2.1 新建 `src/core/argv.ts`（parsePayload：--json / --file / 具名 flag / 位置参数 / input source / ajv 验证）

**Verify**: 单测用例（hardcode）验证 @file/@stdin/@env 解析逻辑。

---

## Phase 3: API Command

- [x] T3.1 新建 `src/commands/api.ts`（api call / list / describe 三个子命令）
- [x] T3.2 修改 `src/cli.ts`（注册 api 命令）

**Verify**: `siyuan api --help` 有输出；`siyuan api list` 输出 `[]`（schema 尚未注册时）。

---

## Phase 4: Endpoint Schemas（22 个）

- [x] T4.1 `src/apis/system/version.ts`
- [x] T4.2 `src/apis/system/bootProgress.ts`
- [x] T4.3 `src/apis/query/sql.ts`
- [x] T4.4 `src/apis/notebook/lsNotebooks.ts`
- [x] T4.5 `src/apis/notebook/createNotebook.ts`
- [x] T4.6 `src/apis/filetree/listDocsByPath.ts`
- [x] T4.7 `src/apis/filetree/createDocWithMd.ts`
- [x] T4.8 `src/apis/filetree/renameDoc.ts`
- [x] T4.9 `src/apis/filetree/removeDoc.ts`
- [x] T4.10 `src/apis/filetree/getHPathByID.ts`
- [x] T4.11 `src/apis/block/getBlockKramdown.ts`
- [x] T4.12 `src/apis/block/appendBlock.ts`
- [x] T4.13 `src/apis/block/insertBlock.ts`
- [x] T4.14 `src/apis/block/updateBlock.ts`
- [x] T4.15 `src/apis/block/deleteBlock.ts`
- [x] T4.16 `src/apis/attr/getBlockAttrs.ts`
- [x] T4.17 `src/apis/attr/setBlockAttrs.ts`
- [x] T4.18 `src/apis/search/fullTextSearchBlock.ts`
- [x] T4.19 `src/apis/export/exportMdContent.ts`
- [x] T4.20 `src/apis/asset/upload.ts`
- [x] T4.21 `src/apis/notification/pushMsg.ts`
- [x] T4.22 `src/apis/index.ts`（统一 re-export + 注册到 registry）

**Verify**:
```bash
siyuan api list                              # 22 条
siyuan api query.sql -h                      # 完整帮助含示例
siyuan api describe query.sql                # 完整 schema JSON
siyuan api query.sql "SELECT 1"              # 实际调用（需运行中的思源实例）
```

---

## Progress

**Overall**: 28 / 28 tasks ✅

| Phase | Done | Total | Status |
|-------|------|-------|--------|
| P1: Registry + Permission | 3 | 3 | ✅ |
| P2: argv 解析 | 1 | 1 | ✅ |
| P3: API Command | 2 | 2 | ✅ |
| P4: Endpoint Schemas | 22 | 22 | ✅ |

**Recent**: [2026-04-17] 22 个 endpoint schema + registry + permission + api command 完成，build / list / describe / help / dry-run 验证通过

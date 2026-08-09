---
title: native-cli-adaptation Context Map
created: 2026-08-09
updated: 2026-08-10
---

# Native CLI Adaptation Context Map

任务：N1 命令入口兼容改造与 N2 文档检查点升级均已验收；本文保留实现导航，供提交、发布和后续维护使用。

## N1（已完成）

- `package.json` — 同时发布 `siyuan-cli` 规范 bin 与 `siyuan` 兼容别名
- `src/cli.ts` — `CLI_NAME = 'siyuan-cli'`，根命令和自定义帮助统一使用规范名称
- `tests/cli-entry.test.ts` — 双 bin 与帮助路由测试
- `skills/siyuan-cli/SKILL.md`、`src/docs/`、`README.md`、`CHANGELOG.md` — 迁移和版本兼容说明
- 完整结果：`nodes/N1-command-entry-compat/TASK-NODE.SPEC.md`

## N2 Core Files

### History endpoint 与版本门槛

- `src/shared/schema.ts` — `EndpointSchema.minKernelVersion` 已存在，但当前没有运行时消费者
- `src/api/guard.ts` — endpoint 执行链；最低 kernel 版本检查必须发生在目标请求前，并保持既有 payload、permission、approval、dry-run 顺序可解释
- `src/api/command.ts`、`src/shared/argv.ts` — endpoint help/list 呈现；N2 只增加最低版本的最小清晰展示
- `src/api/endpoints/system/version.ts` — 已有 kernel 版本 endpoint，可用于 connected-kernel 版本探测
- `src/api/endpoints/index.ts` — 新增 `history.createDocHistory` 的注册入口
- `src/api/endpoints/history/createDocHistory.ts` — N2 新文件；参考现有写 endpoint schema，声明 `minKernelVersion: '3.7.0'`
- `src/api/registry.ts` — schema 注册、classification 派生与 registry 校验

### 统一 checkpoint tool

- `src/tool/builtins/checkpoint-doc.ts` — N2 主实现面；当前只生成 Kramdown、属性、引用关系和 README 本地恢复包
- `src/tool/registry.ts` — `ToolContext.callEndpoint` 通过完整 guard 链调用 history endpoint
- `src/tool/builtins/index.ts` — `checkpoint-doc` 已注册，无需新增另一个浅 tool
- `src/tool/builtins/brute-edit.ts` — 行为非目标；只用于确认文档/示例继续要求编辑前显式 checkpoint，不增加隐式打点

### 权限与错误

- `src/shared/permission.ts` — endpoint/tool/action/notebook/path 规则；history 创建必须复用现有机制
- `src/shared/errors.ts` — 结构化 unsupported-version 与 partial failure 错误的落点
- `.dev/docs/error-model.md` — 新错误码若成为稳定行为，需要同步项目错误模型
- `.dev/docs/permission-model.md` — classification、permission 与 approval 语义依据

### 测试与文档

- `tests/endpoint-schemas.test.ts` — endpoint schema 完整性
- `tests/api-coverage.test.ts`、`tests/core-contracts.test.ts` — guard、classification 与版本门槛测试候选位置
- 现有 checkpoint/tool 测试或新增聚焦测试 — 覆盖新版双层成功、旧版降级、dry-run 和 partial failure
- `skills/siyuan-cli/SKILL.md`、`src/docs/recipes/edit-content.md` — 指导 Agent 在一组高风险编辑前显式调用一次 `checkpoint-doc`

## Upstream Evidence

- `/tmp/siyuan-src/kernel/api/history.go:createDocHistory` — 请求 `{id}`，成功响应不返回 `historyPath`
- `/tmp/siyuan-src/kernel/model/history.go:CreateDocHistory` — 拷贝文档 `.sy` 与内嵌 AV 到 workspace history
- 路由自 SiYuan v3.7.0 起存在，并带 `CheckReadonly`
- 因 create 响应不返回历史路径，N2 不实现自动猜测最新历史或自动 rollback

## Navigation

- 新 endpoint 样板：`src/api/endpoints/block/updateBlock.ts` + `src/api/endpoints/system/version.ts`
- 版本检查接入点：`EndpointSchema.minKernelVersion` → `src/api/guard.ts` → help/list
- checkpoint 当前数据流：完整读 `src/tool/builtins/checkpoint-doc.ts`
- 权限与 approval：`.dev/docs/permission-model.md` → `src/api/guard.ts` → `src/shared/permission.ts`
- N2 已验收结果：`nodes/N2-document-checkpoint/TASK-NODE.SPEC.md`
- 独立 resolver 发现：`nodes/N2-document-checkpoint/WORKSPACE-RESOLVER-FINDING.md`

## Closed Scope

- 不实现 native search、file grep、native backend 或 serve 管理
- 不修改 `brute-edit` 写入行为
- 不封装完整 history 搜索、读取、回滚链
- 不引入跨进程 checkpoint session、时间窗口去重或自动回滚

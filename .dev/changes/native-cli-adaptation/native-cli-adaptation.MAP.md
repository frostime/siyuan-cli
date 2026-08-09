---
title: native-cli-adaptation Context Map
created: 2026-08-09
updated: 2026-08-09
---

# Native CLI Adaptation Context Map

任务：Phase 1 改名 + Phase 2 补端点封装（createDocHistory 等）的方向性 change 的代码面索引。

## Core Files

### Phase 1（改名）涉及面

- `package.json` — `bin` 字段（L18 附近）：`"siyuan": "./bin/siyuan.mjs"` → 新命令名；同时 `name`/`version`/`scripts.siyuan` 需要同步决策
- `bin/siyuan.mjs` — 启动入口（46B，`node ../dist/cli.mjs` 类）；是否改文件名由 bin 字段决定
- `src/cli.ts` — 命令树根；L31 `name: 'siyuan'`（citty meta），L59/65/70 有硬编码 `parentMeta?.name === 'siyuan'` 检测（bare command 帮助路由）
- `skills/siyuan-cli/SKILL.md` — 命令引用（7.7K，agent 使用指南）
- `src/docs/` — 内置文档，rg 命中 10 个文件含命令引用（cli-usage/*.md、recipes/*.md、siyuan-guide/sql-query-guide.md、README.md）
- `README.md` — 人类向文档
- `CHANGELOG.md` — 发布记录（major bump 时更新）

### Phase 2（补端点）涉及面

- `src/api/endpoints/index.ts` — 注册入口：`import { schema as xxx } from './<group>/<name>.js'; registry.register(...)`（看文件尾部 register 调用模式）
- `src/api/endpoints/<group>/<name>.ts` — 单个 endpoint 文件样板（例：`query/sql.ts`）：`export const schema: EndpointSchema<...>`，含 `endpoint`/`summary`/`payload`(JSON Schema)/`classification`(action/domain/cardinality)
- `src/shared/schema.ts` — `EndpointSchema` 类型与 classification 定义（risk 分级派生源头）
- `src/api/registry.ts` — 注册表：从 schema 派生 risk/tags/meta，registry 级校验
- `src/api/guard.ts` — 请求执行链：payload 校验 → permission → approval → kernel → 响应过滤（新端点自动获得）
- `src/api/command.ts` — `siyuan api <id>` 命令面（参数解析/帮助渲染/输入源）
- `tests/endpoint-schemas.test.ts` — endpoint schema 校验测试（新端点须过）
- `tests/api-coverage.test.ts` — api 面覆盖测试

### Tool 接入（checkpoint-doc/brute-edit 升级）

- `src/tool/builtins/checkpoint-doc.ts` — 现有恢复材料机制（10.8K，升级候选）
- `src/tool/builtins/brute-edit.ts` — 文档级重写（17.9K，自动打点接入点）
- `src/tool/registry.ts` — ToolRegistry + run 逻辑（ToolContext 提供 callEndpoint）
- `src/tool/builtins/index.ts` — builtin tool 注册

### 权限/配置（新端点分类参考）

- `src/shared/permission.ts` — 规则引擎（endpoint/tool/action/notebook/path 级）
- `src/workspace/config.ts` + `src/workspace/project-config.ts` — 全局/项目配置（.siyuan-cli.yaml）
- `src/shared/client.ts` — HTTP 调用 kernel（SiyuanClient.call）

## Navigation

- 理解"新 endpoint 长什么样" → 读 `src/api/endpoints/query/sql.ts`（最小样板）+ `src/api/endpoints/block/updateBlock.ts`（写操作样板，看 classification 如何标 write）
- 理解"注册与校验" → `src/api/endpoints/index.ts` 尾部 register 循环 + `src/api/registry.ts`
- 理解"guard 链如何作用于新端点" → `src/api/guard.ts` 后 `src/shared/permission.ts`
- 理解"tool 如何调 endpoint" → `src/tool/registry.ts`（ToolContext.callEndpoint）
- Phase 1 改名找全引用 → `rg -l 'siyuan' src/ skills/ --include='*.ts' --include='*.md'` + `package.json` + `README.md`（注意区分：命令名引用 vs 思源产品名引用）
- 边界：`src/shared/errors.ts`/`docs/README.md` 已修过 `.sspec` 路径引用（.dev 迁移），不要再引 `.sspec/`

## Discovered Later

<!-- append-only -->
- 原生 CLI 行为证据在 `/tmp/siyuan-src/kernel/cli/cmd/`（sparse clone），改名前无需再查，Phase 3 若启动再看
- `history.createDocHistory` 对应 kernel 实现：`kernel/model/history.go` L984 `CreateDocHistory`（证据，勿改）

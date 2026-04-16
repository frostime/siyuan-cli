# skeleton 状态说明

本目录是 **部分骨架**，仅放了可作为共识锚点的几个关键文件：

| 文件 | 作用 |
| --- | --- |
| `package.json` | 依赖清单（v2 确定的技术选型） |
| `tsconfig.json` | TS 配置（ES2022 + strict） |
| `bin/siyuan.mjs` | 入口 shebang |
| `src/core/schema.ts` | **v2 核心类型定义**：`EndpointSchema`、`ToolSchema`、`GuardSpec`、`InputSource`、`deriveEndpointId()` 等，所有模块都以此为类型锚 |

其余 `src/`（commands/core/apis/tools/utils）和 `skills/` 目录暂为空壳，需要本地 Agent 按 `02-architecture.md §4` 的目录结构与 `04/05/06/07` 的模块规范自行实现。

## 推荐落地顺序（对齐 `08-roadmap.md`）

1. `src/core/config.ts` + `src/utils/paths.ts` —— 跑通配置读写
2. `src/commands/workspace.ts` + `src/core/client.ts` —— 跑通 `workspace add/use/verify`（MVP）
3. `src/core/registry.ts` + `src/core/argv.ts` + `src/core/help.ts` —— 跑通 `api list` / `api describe` / `api <endpoint>`
4. `src/apis/system/version.ts` + `src/apis/query/sql.ts` —— 最小可用 endpoint 集合
5. `src/core/permission.ts` —— 按 `07` 三段论实现
6. `src/tools/*.ts` + `src/commands/tool.ts` —— 叠加 Tool
7. `skills/siyuan-cli/SKILL.md` + `src/commands/skill.ts` —— Skill 安装流程

## 类型锚点

`src/core/schema.ts` 是整份设计的**类型真源**。任何其他模块新增代码前，先对着它确认：

- 是否有类型已经定义？直接 import
- 是否需要扩展？回到 `04/05/07` 对应章节讨论后再动 `schema.ts`
- 不要在模块内重新定义同义类型（如另写一份 `GuardSpec`）

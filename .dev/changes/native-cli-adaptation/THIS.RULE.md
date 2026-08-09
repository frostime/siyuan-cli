# native-cli-adaptation 运行规则

## 权威文件

从高到低按以下顺序解释本 change：

1. 仓库级 `AGENTS.md` 与 `.dev/project.md`
2. `native-cli-adaptation.SPEC.md`：总目标、范围、行为契约与验收标准
3. `THIS.RULE.md`：多 Agent 协作和状态管理规则
4. `graph.md`：顶层节点、依赖和当前前沿
5. `nodes/<node>/TASK-NODE.SPEC.md`：单个执行节点的契约和结果
6. 代码、测试及节点调查获得的事实

若节点调查发现上层目标与代码现实冲突，节点 Agent 必须暂停扩大实施范围，记录阻塞并向用户或主 Agent 确认。

## 目录与节点状态

执行节点放在 `nodes/<node-id>-<slug>/`。每个节点至少包含：

- `TASK-NODE.SPEC.md`：节点目的、边界、输出、验收、状态和最终结果
- `COLD-START-PROMPT.md`：供没有前序会话上下文的新 Agent 启动

节点状态只使用：

- `ready`：契约足以派发
- `in_progress`：已由一个执行 Agent 领取
- `blocked`：前提不成立或需要用户决策
- `awaiting_review`：实现完成，等待主 Agent 验收
- `accepted`：主 Agent 已按节点契约验收
- `closed`：有证据地决定不实施

执行 Agent 只更新自己节点的 `TASK-NODE.SPEC.md` 状态和结果。主 Agent 负责更新 `graph.md` 与全局状态。

## 角色边界

### 主 Agent

- 维护总 SPEC、本规则、任务图、术语和演进叙事。
- 在派发前建立节点规格与 cold-start prompt。
- 控制节点顺序和公共写入范围。
- 验收执行结果并整合对后续节点有影响的结论。

### 执行 Agent

- 一次只领取一个节点，并以该节点的 `TASK-NODE.SPEC.md` 为范围边界。
- 可以直接与用户澄清节点内部的实现选择，但不得擅自扩大总目标。
- 可以修改节点范围内需要的项目代码、测试和用户文档。
- 不修改总 SPEC、`graph.md`、`THIS.RULE.md`、`TERM.md` 或 `EVOLVE-STORY.md`；发现这些文件需要调整时，在节点结果中提出。
- 完成后把状态改为 `awaiting_review`，记录改动、验证命令、结果、残余风险和需要主 Agent处理的事项。

### 审计 subagent

- 默认只读，只报告残留引用、测试缺口、发布包问题或契约偏差。
- 除非主 Agent 明确授权，不直接修改实现或全局状态。

## 并发与写入

- 同一个节点只能有一个执行 Agent。
- 默认顺序执行 N1、N2；N1 验收不等待 N2。
- 不允许两个实现 Agent 同时修改公共 CLI、文档或 tool 基础设施。
- 用户另开 session 时，新 Agent 依据节点 cold-start prompt 领取任务；不能仅凭聊天摘要推断范围。

## 实施约束

- 在本 repo 运行自身 CLI 时使用 `pnpm run siyuan ...`，不使用 PATH 中的全局 `siyuan`。
- CLI 内部文档、帮助和提示使用英文；协作文档可以使用中文。
- 测试 SiYuan 数据面只能使用 dev workspace；若 dev workspace 未启动，要求用户启动。N1 不需要访问任何 SiYuan workspace。
- 不修改全局安装的 `~/.agents/skills/...`；SKILL 源文件只改仓库内 `skills/siyuan-cli/`。
- 不发布 npm package、不创建提交、不改写用户已有改动，除非用户明确要求。
- 节点实现遵循最小、内聚、可验证原则；不顺手重构相邻代码。

## 节点交接与验收

执行 Agent 提交验收时，`TASK-NODE.SPEC.md` 的结果至少记录：

1. 实际完成的行为变化；
2. 关键文件范围；
3. 已运行的验证命令和结果；
4. 未运行项目及原因；
5. 偏离节点契约的地方；
6. 对后续节点或总 SPEC 的影响。

只有主 Agent 可以把节点标记为 `accepted`。执行队列清空不等于整个 change 完成，最终状态仍以总 SPEC 为准。

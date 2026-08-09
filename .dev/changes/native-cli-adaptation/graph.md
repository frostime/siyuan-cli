# native-cli-adaptation 任务图

> 状态：N1、N2 已验收；实现完成，待提交与发布。
> 目标权威文档：`native-cli-adaptation.SPEC.md`

## 图谱粒度

一个 node 对应一个可由独立 Agent 完整承接的工作包。用户可以直接与该 Agent 讨论节点内部实现选择。需求维护、节点派发、验收和全局方向调整由主 Agent 负责，不另外拆成 node。

## 顶层图

```text
N1 最小可用的命令入口兼容改造        [accepted；待发布]
 │
 │ 已独立验收；不等待 N2
 ▼
N2 文档检查点升级                    [accepted]
```

## N1：最小可用的命令入口兼容改造

N1 已完成双 bin、规范命令迁移、文档与 SKILL 更新、测试和隔离安装验证。实际 npm 版本选择和发布仍属于发布阶段事项。完整结果见 `nodes/N1-command-entry-compat/TASK-NODE.SPEC.md`。

## N2：文档检查点升级

**目的**：让 Agent 通过一次 `checkpoint-doc` 调用表达“为该文档创建恢复检查点”，由工具内部完成当前 SiYuan 版本能够提供的恢复机制。

**行为契约**：

- 新增 `history.createDocHistory` endpoint，最低 SiYuan kernel 版本为 `3.7.0`。
- SiYuan `>=3.7.0` 时，一次 `checkpoint-doc` 同时尝试创建：
  - SiYuan 内部文档 history；
  - 现有本地恢复包。
- SiYuan `<3.7.0` 时，`checkpoint-doc` 保持本地恢复包能力并输出明确降级 warning。
- `checkpoint-doc --dry-run` 不创建任何恢复材料。
- `>=3.7.0` 时任一层失败都必须报告 partial failure 和已成功保留的材料；不声称两种存储之间具有原子事务。
- `brute-edit` 不隐式创建 history。Agent 在一组高风险编辑开始前显式调用一次 `checkpoint-doc`。

**实现边界**：

- 激活现有 `EndpointSchema.minKernelVersion` 所需的最小执行时版本检查和 help/list 呈现；不建立新的 capability framework。
- history 创建必须走现有 endpoint guard、permission 和 approval 路径。
- `checkpoint-doc` 对外保持一个统一 tool；内部允许分别封装 kernel history 与本地恢复包，以隐藏复杂性并清楚处理 partial failure。
- 第一版只封装 `history.createDocHistory`；不实现完整历史搜索、读取、回滚工作流。
- 不修改 `brute-edit` 行为，不增加跨进程编辑周期状态或自动回滚。

## 已关闭方向

### Native search / grep / backend

评估结论：暂不实施。

- 原生 `search` 与现有 HTTP API 高度重叠。
- `file grep` 的独有增量集中在低频原始文件诊断，对日常 Agent 笔记操作帮助有限。
- 接入成本包括本地 workspace 限制、官方二进制定位、版本消歧、permission/approval、结果过滤和跨平台路径处理。
- 当前没有足够价值支撑专门的 native backend；将来出现明确原始文件诊断需求时再作为新的 change 评估。

### Serve 管理

不实现通过 CLI 启动、停止或管理 SiYuan kernel 进程。

## 验收结果

- **N1**：`accepted`。双 bin、规范命令迁移、文档和隔离安装验证完成。
- **N2**：`accepted`。endpoint 版本门槛、双层检查点、旧版降级、dry-run guard、partial failure、文档、完整测试和 dev workspace 实测通过。
- workspaceDir resolver 与 SiYuan 3.7.3 的兼容发现已单独记录，不属于 N2，也不阻塞本 change。

## 当前前沿

- 实现节点已清空。
- 下一步是整理提交，并在发布阶段确定版本号与执行 npm 发布。

# native-cli-adaptation 演进说明

本 change 起于 SiYuan v3.7.0 引入官方原生 `siyuan` CLI 后发生的全局命令冲突。调研确认，官方 CLI 覆盖大量数据操作并能直接访问 workspace，但本项目仍提供权限、审批、响应过滤、扩展和多工作区等不同价值。

N1 作为最小可用交付，已经由独立 Agent 完成并通过验收。package 同时发布 `siyuan-cli` 规范入口和 `siyuan` 兼容别名，面向用户与 Agent 的命令已经迁移到规范入口，并通过类型检查、完整测试、构建和隔离安装验证。实际版本号与 npm 发布尚未执行。

N1 之后曾计划把新版 HTTP API 与官方原生 CLI 一并吸收为后续能力。进一步比较发现，原生 `search` 与现有 API 高度重叠，`file grep` 的新增价值主要是低频原始文件诊断，却要求承担本地 workspace、二进制定位、权限审批、结果过滤和跨平台路径适配。当前收益不足以支持 native backend，因此 search、grep、native backend 和 serve 管理均已关闭，不进入实现。

N2 最终收敛为文档检查点升级。现有 `checkpoint-doc` 已能把 Kramdown、属性和引用关系保存为本地恢复包；SiYuan 3.7.0 新增的 `history/createDocHistory` 提供了内部文档历史。N2 将两层机制统一到一次显式 `checkpoint-doc` 调用中：新版 kernel 同时创建两层，旧版继续创建本地恢复包并提示降级。`brute-edit` 不隐式重复打点，Agent 应在一组高风险编辑开始前显式调用一次。

N2 已由独立 Agent 实现，并通过主 Agent 验收。`history.createDocHistory` 已接入既有 endpoint/guard 链，`EndpointSchema.minKernelVersion` 已在运行时、help/list 与 extension cache 中生效；`checkpoint-doc` 在新版 kernel 创建内部 history 与本地恢复包，在旧版明确降级。验收阶段额外发现并修复了 supported-kernel dry-run 跳过 history endpoint deny/approval preview 的问题。类型检查、118 项完整测试、构建和 dev workspace 双层检查点实测均通过。

当前 N1、N2 均为 `accepted`，实现阶段完成，尚未提交或发布。N2 实测另发现 SiYuan 3.7.3 的 `getConf` 可能返回空 `workspaceDir`，导致既有 resolver 误判；该问题已独立记录，不阻塞本 change。

你是 `native-cli-adaptation` 的 N2 执行 Agent，负责“文档检查点升级”。此前会话上下文不可用，也不需要恢复。

工作目录是仓库根目录。开始前按顺序完整读取：

1. `AGENTS.md`
2. `.dev/project.md`
3. `.dev/changes/native-cli-adaptation/THIS.RULE.md`
4. `.dev/changes/native-cli-adaptation/nodes/N2-document-checkpoint/TASK-NODE.SPEC.md`
5. `.dev/changes/native-cli-adaptation/native-cli-adaptation.MAP.md`

以 `TASK-NODE.SPEC.md` 为直接任务契约。领取后先将其状态改为 `in_progress` 并填写执行者标识，然后核对代码、实现和测试。默认信任节点中已经确认的产品决策，不重新开展 native CLI 全面调研。可以直接向用户澄清节点内部问题；若证据要求改变用户可见契约或扩大范围，将状态设为 `blocked` 并立即反馈。

不要修改总 SPEC、`graph.md`、`THIS.RULE.md`、`TERM.md` 或 `EVOLVE-STORY.md`。不要实现 native search、grep、backend、serve、自动 rollback 或 `brute-edit` 隐式打点。仓库内运行自身 CLI 使用 `pnpm run siyuan ...`，不要调用 PATH 中的全局 `siyuan`。

真实 SiYuan 测试只能使用 dev workspace；如果它未启动，告知用户并要求启动，不得访问用户主空间。完成后运行节点要求的验证，将状态改为 `awaiting_review`，并在 `TASK-NODE.SPEC.md` 的“结果与影响”中记录实际改动、测试、实测、未验证项、残余风险和后续影响。不要自行发布、提交或标记为 `accepted`。

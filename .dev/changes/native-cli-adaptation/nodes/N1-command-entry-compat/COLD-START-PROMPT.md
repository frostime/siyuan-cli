你是 `native-cli-adaptation` 的 N1 执行 Agent，负责“最小可用的命令入口兼容改造”。此前会话上下文不可用，也不需要恢复。

工作目录是仓库根目录。开始前按顺序完整读取：

1. `AGENTS.md`
2. `.dev/project.md`
3. `.dev/changes/native-cli-adaptation/THIS.RULE.md`
4. `.dev/changes/native-cli-adaptation/nodes/N1-command-entry-compat/TASK-NODE.SPEC.md`

以 `TASK-NODE.SPEC.md` 为直接任务契约。领取后先把其状态改为 `in_progress` 并填写执行者标识，然后调查、实现、测试。可以直接向用户澄清节点内部问题；若问题会改变节点行为契约，则将状态设为 `blocked`，不要自行扩大范围。

不要修改总 SPEC、`graph.md`、`THIS.RULE.md`、`TERM.md` 或 `EVOLVE-STORY.md`。不要处理 N2、native backend、版本探测或 serve。仓库内运行自身 CLI 必须使用 `pnpm run siyuan ...`，不要调用 PATH 中的全局 `siyuan`。N1 不需要也不得访问任何 SiYuan workspace。

完成后运行节点要求的验证，将状态改为 `awaiting_review`，并在 `TASK-NODE.SPEC.md` 的“结果与影响”中记录实际改动、测试结果、未验证项、残余风险和对后续工作的影响；不要自行发布、提交或把节点标记为 `accepted`。

# N2：文档检查点升级

- **状态**：`accepted`
- **执行者**：Pi Agent（N2 document checkpoint session）
- **上游目标**：`../../native-cli-adaptation.SPEC.md`
- **协作规则**：`../../THIS.RULE.md`
- **代码索引**：`../../native-cli-adaptation.MAP.md`

## 任务目的

把现有 `checkpoint-doc` 升级为一个意图完整的文档检查点工具。调用方只需显式调用一次，工具内部负责创建当前 SiYuan 版本能够提供的恢复材料，不要求 Agent 协调多个浅工具或在每次 `brute-edit` 中重复打点。

N2 完成后，SiYuan `>=3.7.0` 使用内部文档 history 与本地恢复包两层保护；旧版 SiYuan 保持现有本地恢复能力。

## 已确认的行为契约

### `history.createDocHistory` endpoint

- 新增 `/api/history/createDocHistory`，CLI id 为 `history.createDocHistory`。
- payload 为必填文档块 ID `{ id }`。
- `minKernelVersion` 为 `3.7.0`，classification 和 payload guard 必须反映它会为指定文档创建 kernel history。
- endpoint 必须走现有 payload validation、permission、approval、dry-run 和 kernel client 链路。
- 直接调用旧 kernel 时，在发送目标请求前返回结构化 unsupported-version 错误。
- help/list 中必须能看到最低 kernel 版本要求。

### `checkpoint-doc` 统一行为

- 不新增另一个 checkpoint/history tool，也不向用户暴露 `local/history/both` 模式。
- SiYuan `>=3.7.0`：同一次真实调用尝试创建内部文档 history 和现有本地恢复包。
- SiYuan `<3.7.0`：成功创建本地恢复包，并通过 `ToolResult.warnings` 明确说明内部 history 不可用。
- `--dry-run`：可以执行必要的只读检查，但不得创建内部 history 或写本地文件；输出同时描述两层计划或旧版降级计划。
- 新版 kernel 中只有两层都成功才算完整成功。任一层失败必须以非零错误结束，错误 details 指明每层状态和已经成功保留材料的位置；两种存储之间不承诺原子性。
- 旧版 kernel 的 local-only 结果是预期兼容降级，不属于 partial failure。
- 返回结果统一报告 kernel history 状态、本地目录/文件和既有统计数据。
- 由于工具现在会创建 kernel history，其 tags/classification 必须保守、清楚地反映写入副作用。

### 编辑流程

- `brute-edit` 代码行为保持不变，不隐式创建 history，不增加 session、时间窗口去重或自动 rollback。
- SKILL 与编辑 recipe 指导 Agent：在一组高风险编辑开始前显式调用一次 `checkpoint-doc`，后续同组编辑不重复调用。

## 实施范围

1. 新增并注册 `history.createDocHistory` EndpointSchema。
2. 让既有 `EndpointSchema.minKernelVersion` 在 endpoint 执行时生效，并在 help/list 中最小充分地呈现。
3. 增加所需的版本比较和结构化错误；只解决现有字段的实际消费，不设计通用 capability subsystem。
4. 重构 `checkpoint-doc` 内部，使 kernel history 和本地恢复包各自职责清楚，由同一个 tool 统一编排结果、兼容降级和 partial failure。
5. 更新 checkpoint 的 classification、输出、帮助和示例。
6. 更新仓库内 `skills/siyuan-cli/SKILL.md` 与 `src/docs/recipes/edit-content.md`，必要时同步其他直接受影响的 bundled 文档。
7. 增加单元/契约测试，并在 dev workspace 做一次真实双层检查点验证。

## 非目标

- 不实现原生 CLI 的 search、file grep、native backend 或二进制发现。
- 不实现 `serve` 或 kernel 进程管理。
- 不封装 `searchHistory`、`getHistoryItems`、`getDocHistoryContent`、`rollbackDocHistory` 等完整恢复链。
- 不修改 `brute-edit` 的输入、写入或执行逻辑。
- 不实现自动 rollback、最新 history 猜测、跨进程 checkpoint session 或时间窗口去重。
- 不新增 checkpoint 模式开关或另一个只调用单 endpoint 的浅 tool。
- 不承诺内部 history 与本地恢复包原子提交。
- 不发布 npm package，不决定发布版本号。

## 大致实现方案

- endpoint 文件遵循现有一个文件一个 schema 的注册模式，复用现有 guard 链。
- 版本门槛以 `EndpointSchema.minKernelVersion` 为 authored truth。执行层通过已连接 kernel 的版本信息在目标请求前检查；避免把版本判断散落到每个 endpoint。
- `checkpoint-doc` 可以先取得 `system.version`，再决定是否调用 `history.createDocHistory`；低版本不要通过捕获目标 endpoint 的 404 来实现兼容。
- kernel history 与本地恢复包在内部保持两个清晰步骤，统一编排层汇总成功、降级和错误。具体顺序由执行 Agent 决定，但 partial result 必须可诊断。
- 新版 partial failure 使用结构化 `CliError` 或等价现有错误通道，必须保留已成功材料的信息，不能只抛失去上下文的普通 Error。
- 保留现有本地恢复包格式和文件内容，除非统一结果所需的最小字段调整有明确理由。

## 验收条件

### Endpoint 与版本

- [x] `history.createDocHistory` 已注册，schema 校验通过，help/list 显示最低版本 `3.7.0`。
- [x] payload 缺失/错误、permission deny、approval、dry-run 和正常执行均走既有 guard 语义。
- [x] kernel `3.6.x` 在目标请求前得到结构化 unsupported-version 错误；`3.7.0` 与更高版本通过版本门槛。
- [x] 版本比较覆盖等于、低于、高于及项目实际需要处理的版本字符串格式。

### Checkpoint tool

- [x] `>=3.7.0` 完整成功时，内部 history 与本地恢复包各创建一次，统一结果包含两层状态和原有统计。
- [x] `<3.7.0` 时不调用 create history，本地恢复包仍成功，输出明确 warning。
- [x] dry-run 不创建 history、不写文件，并准确报告计划。
- [x] history 失败但本地材料成功、或本地失败但 history 成功时，命令不返回完整成功；错误 details 能定位已保留材料。
- [x] `checkpoint-doc` 的 tags/classification、help、示例与实际副作用一致。
- [x] 现有本地恢复包内容和默认目录行为无无关回归。

### 文档与全局验证

- [x] SKILL 和编辑 recipe 明确“一组高风险编辑前显式 checkpoint 一次”，没有声称 `brute-edit` 会自动打点。
- [x] 没有新增 native search、grep、backend、serve 或完整 history 恢复链代码。
- [x] `pnpm run typecheck`、`pnpm test`、`pnpm run build` 通过。
- [x] dev workspace 实测真实文档 history 与本地恢复包创建成功；若 dev workspace 未启动，先要求用户启动。

## 执行要求

1. 开始时将状态改为 `in_progress` 并填写执行者标识。
2. 先核对实际 guard、help、tool 和测试结构；不依赖 MAP 中可能变化的行号。
3. 仅在内部顺序、helper 边界和错误 details 等已授权范围内自行决策。
4. 若发现必须改变用户可见契约或扩大权限/版本框架，改为 `blocked` 并直接向用户确认。
5. 完成后将状态改为 `awaiting_review`，填写下方结果，等待主 Agent 验收。

## 结果与影响

> 由执行 Agent 完成后填写。

- **实际改动**：
  - 新增并注册 `history.createDocHistory`，声明文档 ID write guard 与 `minKernelVersion: 3.7.0`。
  - 让 `minKernelVersion` 在 registry 校验、extension cache、endpoint help、grouped help、API list 和 `executeEndpoint()` 中生效；旧 kernel 在目标请求前返回 `UNSUPPORTED_KERNEL_VERSION`。
  - 新增严格 authored minimum 校验、兼容实际 kernel 版本字符串的比较/提取，以及 `KERNEL_VERSION_UNRECOGNIZED` 结构化错误。
  - `checkpoint-doc` 在 SiYuan >=3.7.0 创建 kernel document history 与原有本地恢复包；旧版 local-only + warning；dry-run 只读规划；partial failure 返回两层状态和材料位置。
  - 保留本地恢复包的三个文件、`checkpointVersion: 1`、数据结构、默认目录和原有统计字段；tool 改为 write/content，并同时检查文档 read/write 权限。
  - 更新 SKILL、编辑 recipe、README、block guide、EndpointSchema 与错误模型文档；`brute-edit` 实现未修改。
  - 新增 endpoint/version、checkpoint orchestration、help/list、extension cache 与 partial failure 合约测试。
  - 主 Agent 验收修复：supported-kernel dry-run 也通过 `history.createDocHistory` 的 endpoint dry-run 路径验证 deny/approval，仍不发送真实 history 写请求；预览保留 `wouldRequestApproval`。
- **验证命令与结果**：
  - `pnpm run typecheck`：通过，无诊断。
  - Worker 完成时 `pnpm test`：通过，117/117。
  - 主 Agent 增加 dry-run guard 回归测试后：118/118 通过。完整测试首次复核遇到既有 approval broker 5 秒启动超时；`tests/approval-client.test.ts` 单独重跑通过，随后完整测试重跑通过。
  - `pnpm run build`：通过，137 个构建产物，无构建错误。
  - Worker 独立 code review：两轮；首轮发现并修复 system.version 响应形状、local preparation partial failure、authored minimum 校验问题；复审无 blocking finding。
  - 主 Agent 验收 review：发现并修复 checkpoint dry-run 跳过 history endpoint guard 的问题；针对性测试、typecheck、完整测试、build 与 diff check 均通过。
- **dev workspace 实测**：
  - 目标仅为 `H:\Project_Active\SiYuanDevSpace`；由 `getWorkspaces`、workspace `conf.json` 和端口响应共同确认 dev kernel 为 `http://127.0.0.1:1181`，版本 `3.7.3`。
  - 创建临时文档 `20260809200521-l780dbs` 后真实调用 `checkpoint-doc --yes --print json`：`kernelHistory.status=created`、`localRecovery.status=created`、warnings=0。
  - kernel history 文件由 0 个变为 1 个，实际路径为 `history/2026-08-09-200612-update/20220112192155-gzmnt6y/20260809200521-l780dbs.sy`。
  - 本地 `content.kramdown.md`、`recovery.json`、`README.md` 均存在；`checkpointVersion=1`、document ID 和统计正确。
  - 临时 live 文档已删除，并确认 blocks 查询剩余 0 行；含 token 的临时直连配置与本地测试输出已删除。
  - `workspaceDir` 自动 materialize 的独立兼容发现记录在 `WORKSPACE-RESOLVER-FINDING.md`。
- **未运行项目**：
  - 未在真实 SiYuan 3.6.x 上执行降级；旧版行为由单元/合约测试覆盖。
  - 未单独进行需要人工操作 Approval Center 的真实 approval 流程；新 endpoint 的 approval 决策与 dry-run preview 已覆盖，执行复用既有 guard/approval 链。
- **偏离契约**：无用户可见契约偏离。为保证“本地 preparation 失败但 history 成功”仍可诊断，真实调用内部先尝试 kernel history，再收集并写本地恢复包；两层仍不承诺原子性。
- **残余风险**：
  - `createDocHistory` 成功响应不返回 history path，统一结果只能报告 created 状态，不能报告 kernel 文件位置或自动恢复。
  - SiYuan 3.7.3 的 `getConf` 返回空 `conf.system.workspaceDir`，导致现有 workspaceDir resolver 误报；这是 N2 之外的既有兼容问题，详见独立发现文档。
  - 两层之间非原子；partial failure 必须由调用方保留已成功层并在编辑前处理失败层。
- **对总 SPEC / 发布的影响**：N2 已通过主 Agent 验收；workspace resolver 兼容问题已作为独立发现记录，不阻塞本节点。实现尚未提交或发布，发布阶段仍需确定版本号。

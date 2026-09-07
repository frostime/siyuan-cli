---
name: process-binding-reliability
summary: 在不改动 Agent 运行框架的前提下，稳定跨平台进程绑定，并整理其状态、输出和代码边界。
updated: 2026-09-08
status: accepted
---

# 进程绑定可靠性

## 当前状态与材料边界

本 Change 从产品需求和已经验证的运行事实重新开始。外部技术的验证结果见 `process-binding-reliability.TECH-REPORT.md`。

用户已经确认：保留两步进程绑定；允许使用同一个确认码重试；默认输出面向 Agent 使用紧凑文本；MSYS 只是 Windows 捕获器内部按能力启用的支线；源码采用 workspace 领域下独立 `binding/` 子模块的组织方向。正常业务调用无法可靠判断绑定时遵循 fail loudly；待确认记录按固定时间过期，正式绑定只在能够确证 anchor 已死亡或 PID 已复用时回收；进程实例继续沿用既有身份合同；文档只声明实际验证范围，不把尚未验证写成硬性不支持。

剩余产品行为已经闭合，本文状态为 `accepted`。正式实现仍需等待真实 Git Bash 技术验证和用户接受后续 SHAPE。

上一轮 `caller-current` Change 以及 LAI #1、#10、#11 只保留为历史材料，其中的表述、推测、建议方案和范围都不再是本轮需求。本轮工作以本文和用户后续确认的修改为准。

## 背景

`siyuan-cli` 原来只有三种 workspace 选择方式：单次命令使用 `--workspace`，项目目录使用 `.siyuan-cli.yaml`，整台机器使用 `config.current`。它们都无法满足下面的场景：一个长期运行的 Agent 想选定 workspace 并让自己的后续调用继续使用，同时又不影响同机运行的其他 Agent，也不要求每次调用重复传参。

上一轮 `caller-current` Change 为此引入了进程绑定。之所以选择进程关系，而不是 Agent 身份或环境变量，是因为 CLI 无法要求 Pi、Claude Code、Codex 等运行框架配合：每次 `siyuan-cli` 都由临时工具进程和 shell 间接启动，CLI 只能从当前操作系统暴露的进程关系反向寻找长期调用者。

上一轮实现已经进入 `dev`，包括：

- `current bind` / `confirm` / `unbind` 命令；
- 待确认记录和正式绑定记录；
- 两次独立调用寻找最近共同进程的算法；
- process binding 与项目文件、全局默认之间的 workspace 解析；
- 对应测试和 Agent SKILL 说明。

自动化测试和部分调用方式能够通过，但随后在真实的 Windows Pi 环境中发现：CLI 经 MSYS shell 启动时，Windows 的父进程关系可能在到达仍然运行的 Pi 进程之前断开。当前实现遇到清单中不存在的父进程号会直接停止，并把已经截短的关系当成正常结果。它可能使同一个 Agent 的 `bind` 与 `confirm` 找不到共同进程；正式绑定如果在后续调用中无法再次观察到，也会被当成当前没有绑定，继续进入较低优先级的 workspace 选择来源。

围绕这些现象形成的旧 LAI 记录、开发日志和 SKILL 文案又混入了尚未验证的原因、特定开发命令以及过早的解决建议，导致“产品要保证什么”和“某个环境为什么失败”彼此缠绕。本 Change 因此不是直接照旧 issue 修一个 MSYS 特例，而是先重新建立可靠性合同，再根据已经验证的技术边界修复实现。

## Problem Statement（问题陈述）

当前 process binding 已经有完整的功能外形，但还不能在要求验证的运行环境中可靠履行其核心承诺：

> 同一个长期调用者完成两步绑定后，它的后续短命 CLI 调用能够找到同一个绑定；不属于该共同进程范围的其他调用者不受影响；无法取得充分证据时明确失败，不猜测，也不悄悄表现成另一种 workspace 选择。

需要同时解决三组相互关联的问题：

1. **进程观察不可靠。** Windows 原生父进程关系不能恢复已经退出的 MSYS 中间创建者；程序又没有区分“关系正常结束”和“关系中途断开”。
2. **绑定生命周期和输出不清楚。** `bind` 只是开始流程，`confirm` 才会生效，但当前输出、confirm 重试、待确认记录取消以及正式解绑的职责没有形成一套清楚协议；`current` 还绕过项目的 compact/JSON 输出机制而固定输出 JSON。
3. **代码责任分散。** `src/current/` 只有命令外壳，而进程观察、绑定状态和 workspace 解析平铺在 `src/workspace/`；继续增加 Windows/MSYS 支线会进一步放大理解和修改成本。

本 Change 要在不修改 Agent 运行框架、不引入身份服务的前提下：明确绑定成功、失败、重试和恢复行为；让 Windows 原生路径保持主流程、MSYS 按运行能力作为条件支线；并把进程绑定集中到 workspace 领域下独立的 `binding/` 子模块。

完成后的判断标准不是“所有平台都一定能绑定成功”，而是：经过验证的环境可以稳定完成并复用绑定；外部信息不足时失败可见且恢复动作明确；未经过验证的环境被如实标注而非硬性排除；不使用进程绑定的路径不被平台支线干扰；源码边界足以让平台观察和绑定协议分别演进。

## 已确认的责任和限制

- 不要求修改 Pi、Claude Code、Codex 或其他 Agent 运行框架。
- 不要求 Agent 生成身份、传递长期环境变量或配合新的调用协议。
- 不引入身份令牌、中间服务或长期运行的辅助进程。
- 继续使用“两次独立调用寻找共同进程”的设计，不把进程关系当成逻辑 Agent 身份认证。
- 临时 CLI、shell 和工具调用进程可以结束。正式绑定应落在两次调用共同看到的稳定进程上。
- `current bind` 只创建一次待确认尝试；只有 `current confirm` 可以创建正式绑定。
- 证据不足时允许绑定失败。
- 不得只凭进程名称选定共同进程，也不得猜测缺失关系后面是谁。
- 不属于同一可观察 OS 进程范围的新终端或无关进程树，不会仅仅因为位于同一台机器就继承绑定；共享同一最终 anchor 的逻辑调用者按现有合同共享绑定。
- Windows 原生调用是主路径；MSYS 只在运行证据表明当前 CLI 确实属于一套 MSYS 进程表时启用。
- 当前 Pi on Windows + MSYS2 是必测场景，Git for Windows Git Bash 必须单独实测。文档列出实际测试环境和版本；其他平台或版本的稳定性未经验证，但不因此设置产品名或版本白名单式硬拒绝。
- 除非本文明确修改，workspace 选择顺序、项目文件冲突、权限、凭据和连接建立仍遵循 `src/workspace/workspace-resolution.SPEC.md`。
- 面向最终用户和 Agent 的 SKILL 不得包含开发命令、临时调查结论或已经放弃的解释。

## 用户操作与状态

### 开始绑定

```bash
siyuan-cli current bind <workspace>
```

第一次进程查询成功后，程序创建待确认记录，保存确认码、workspace、第一次观察、工作目录、创建时间和固定过期时间。此时没有正式绑定。

默认文本不以孤立的 `Binding is not active.` 开头，而应先说明流程已经开始，例如：

```text
Binding procedure started for workspace "dev".
Next: run this command in a new CLI invocation:
  siyuan-cli current confirm <nonce>
The binding takes effect only after confirmation succeeds.
```

输出还必须给出取消命令和过期时间。

如果第一次进程查询失败，不创建待确认记录。调用者可以重新执行 `current bind`。

### 确认和重试

```bash
siyuan-cli current confirm <nonce>
```

确认成功后，程序消费待确认记录并创建正式绑定。

确认失败但待确认记录仍然有效时，保留原记录，允许在新的独立 CLI 调用中使用同一个确认码重试。重试不延长最初的过期时间。错误输出必须明确说明：

- 正式绑定没有创建；
- 待确认记录是否保留；
- 是否可以重试；
- 精确的重试与取消命令；
- 本次是否向 SiYuan 发出了请求。

确认码已过期、不存在、损坏、已消费或已取消时不能重试，需要重新开始绑定。

第一版不实现无界自动重试。若实现层能够明确识别同一次查询中的瞬时快照竞争，可以在一个命令内部有限地重新采集一次；这属于待 SHAPE 确认的局部技术决定，不改变用户可见协议。

### 取消待确认记录

```bash
siyuan-cli current cancel <nonce>
```

`cancel` 只删除指定确认码对应的待确认记录，不查询当前进程关系，也不改变正式绑定。

### 解除正式绑定

```bash
siyuan-cli current unbind
```

`unbind` 只解除当前进程范围中已经确认的绑定，不再顺便删除所有待确认记录。

### 正常业务调用中的观察不确定

显式 `--baseUrl`、`--workspace` 或 `SIYUAN_CLI_WORKSPACE` 继续短路 process binding，不因本机存在绑定记录而触发进程观察。

没有显式选择时，程序先验证正式绑定记录并清理能够确证失效的记录：

- 如果没有保留下来的正式绑定记录，不查询 caller 进程关系，正常进入项目文件和全局默认选择；
- 如果观察到可靠匹配，使用该绑定；
- 如果观察结果足以证明当前调用不匹配任何正式绑定，正常进入项目文件和全局默认选择；
- 如果仍有正式绑定记录，但观察信息不足以判断当前调用是否匹配，命令必须 fail loudly：以非零退出码停止，不向 SiYuan 发送请求，不把“不确定”当成“没有绑定”，并提示调用者使用显式 `--workspace <name>` 恢复。

因此，一个仍然有效但与当前调用无关的绑定，可能在当前调用无法完成进程观察时迫使调用者显式选择 workspace。这是避免静默选错 workspace 的已接受代价。

### 状态过期与正式绑定回收

待确认记录继续使用固定过期时间；超过期限后直接删除。正式绑定没有按墙上时间计算的 TTL，它的有效期由 anchor 进程实例决定。

正式绑定只在以下情况自动回收：

- 操作系统明确证明 anchor PID 已不存在；
- 同一 PID 当前对应的权威启动标识与记录不同，证明 PID 已被复用。

查询失败、权限不足或证据不完整时，anchor 状态为未知，记录必须保留。命令签名不同不能单独证明 PID 已复用。无法解析或不符合状态结构的记录继续按现有自修复行为清理。回收发生在仍需判断 process binding 的隐式解析之前；具体批量查询接口由 SHAPE 决定。

## 输出合同

`current` 命令的成功输出默认采用面向 Agent 的紧凑文本。需要程序化处理时，调用者显式传入：

```bash
--print json
```

JSON 模式应使用项目统一的结构化输出机制，而不是在 `current` 命令中直接调用 `JSON.stringify()` 建立另一套格式。

失败继续遵循项目现有错误合同：以非零退出码在 stderr 输出结构化 JSON。与绑定有关的错误必须在 `message`、`hint` 和 `details` 中提供明确状态和可直接执行的恢复命令。

默认文本和 JSON 都必须使 Agent 无需推断以下事实：

- 绑定流程是否只是开始，还是已经正式生效；
- 当前应该执行 confirm、重试、cancel、unbind，还是重新 bind；
- workspace 相关命令现在是否可以安全继续；
- 失败发生时是否已经向 SiYuan 发出请求。

## 进程关系观察

### 结果语义

进程观察必须保留停止原因，使调用者能够区分可靠匹配、证据充分的不匹配和证据不足。对于 bind/confirm，两次观察只要在断点之前已经看到同一个可可靠识别的共同 anchor，就可以成功，不要求继续追到系统根；捕获命令失败或输出格式无法验证时，不能保存为正常观察。对于后续隐式业务调用，截断关系中没有找到 anchor 不能当成证据充分的不匹配，必须按前述 fail loudly 合同处理。

### 进程实例身份

继续沿用既有合同：PID + 平台启动标识是强匹配；任一观察缺少启动标识时，可降级为 PID + 相同命令签名；绝不只凭 PID 匹配。本 Change 不重新定义该既有身份结构。

Windows 原生段和 MSYS 接合后的持久化身份都使用 Windows PID 与同一来源、同一精度的 Windows 创建时间。MSYS PID 只表达逻辑关系，不进入持久化身份。用于回收正式绑定时，只有权威启动标识不同才能确证 PID 复用；命令签名只承担既有降级匹配和脱敏诊断作用。

### 主路径

Linux、macOS 和 Windows 原生环境继续使用各自的操作系统进程关系。公共绑定逻辑只接收统一的进程实例和父子关系，不理解具体平台命令。

### Windows 下的条件 MSYS 支线

Windows 捕获器先取得原生 Windows 信息。只有发现可用的 `ps`，并且其进程表中确实存在 Windows PID 等于当前 CLI PID 的记录时，才启用 MSYS 支线：

1. 使用跨已验证版本一致的 `ps -e -l` 取得 MSYS PID、PPID 和 Windows PID；
2. 沿 MSYS 逻辑父进程关系找到该进程表的边界；
3. 用边界进程的 Windows PID 接回 Windows 原生关系；
4. 合并两段观察；
5. 任何接合步骤无法可靠核对时，报告关系不完整，不猜测缺失部分。

不得通过 Pi、Git Bash、`bash.exe` 等产品名或进程名直接认定当前调用属于 MSYS。能力检测失败时不进入该支线。

MSYS 只提供关系边；正式进程身份仍使用 Windows PID 和统一来源的创建时间。不得把 MSYS PID 持久化为绑定身份。

### 验证范围的表达

最终文档必须列出实际测试过的操作系统、运行方式和工具版本，并把其他环境表述为“稳定性未经验证”。不得因为尚未测试就写成硬性不支持，也不得建立未经必要性证明的平台或版本拒绝名单。

运行时仍按可观察能力和证据判断：满足能力条件时可以尝试；缺少实现所需能力、捕获失败或证据不足时明确失败。当前变更必须实际验证 Windows 原生、Pi on Windows + MSYS2 和 Git for Windows Git Bash，并保留 Linux、macOS 已有成功行为；这些验证结果决定最终可声称的验证范围。

### 暂不采用管道进程号

标准输入输出管道另一端的进程号在当前 Pi 环境中能够直接指向 Pi，但重定向、共享读取进程和文档保证仍有未决限制。第一条正式实现路线不使用该信号。

只有真实 Git Bash 验证或后续支持环境证明“MSYS + Windows”两段关系不足时，才重新激活管道路线调查。

## 持久维护者文档

最终变更必须在 `.dev/docs/process-binding.md` 维护一份项目级开发者文档，使没有参与本 Change 的维护者无需重走调查过程，就能理解进程绑定的底层技术基础、选定方案、证据和修改约束。

该文档应说明 Windows 原生关系的能力边界、两次调用选择共同进程范围的原因、条件 MSYS 支线与 Windows handoff、进程实例身份、观察结果与 fail-loud 行为、状态生命周期，以及实际验证环境和可复现的验证路线。它应把概念链接到最终源文件、测试、长期 SPEC 和外部依据，而不是复制容易漂移的局部实现。

文档只描述当前有效状态，不保留临时 PID、调查时间线或开发 wrapper。它必须区分“已经实测”和“尚未验证”，不得把缺少验证写成硬性不支持；最终代码、证据或约束发生实质变化时，应在同一变更中更新该文档及 `.dev/project.md` Docs Index。

## 代码组织

对外仍保留两个顶层命令：

```text
siyuan-cli workspace ...   管理全局 workspace 目录
siyuan-cli current ...     管理本次调用的 workspace 选择
```

源码不再为只有一个命令文件的 `src/current/` 保留独立顶层领域。进程绑定集中到 workspace 领域下独立的 `binding/` 子模块。当前接受的结构方向是：

```text
src/workspace/
├── command.ts                 workspace 目录命令
├── current-command.ts         current 选择命令
├── binding/
│   ├── protocol.ts            pending、confirm、cancel、正式绑定生命周期
│   ├── process-tree.ts        公共进程模型、实例匹配、共同进程算法
│   ├── windows.ts             Windows 原生观察和条件接合
│   └── msys.ts                MSYS 能力检测、进程表解析和逻辑关系
├── config.ts
├── project-config.ts
├── resolve.ts
├── resolver.ts
├── diagnostics.ts
└── paths.ts
```

边界已经确定，具体文件名和是否需要少量辅助文件由正式 SHAPE 决定。

约束：

- `binding/` 不负责 workspace 目录、凭据、权限或连接建立；
- `resolve.ts` 不理解 Windows、MSYS 或具体进程采集命令；
- 命令层不实现共同进程算法或状态文件规则；
- 不建立通用平台插件系统或多信号证据图；
- 不为了目录对称而重组与本 Change 无关的整个 workspace 模块；
- deprecated workspace aliases 不应迫使命令模块互相调用，具体共享操作由 SHAPE 确定合适的领域所有者。

## 已验证的事实

下列事实已经由本轮 SPIKE 验证，详细证据见技术报告：

- Windows 原生父进程接口不能事后恢复已经退出的中间进程原来的上级。
- 当前 Pi/MSYS2 环境可以用 MSYS 逻辑关系接回 Windows 关系，并在独立工具调用中到达同一个 Pi Node 进程。
- Git Bash 所带旧版 `ps` 与当前 MSYS2 的选项解析存在差异，`ps -e -l` 在两边均提供所需列。
- 管道进程号是可能的补充信号，但不足以单独承担绑定身份。
- Job Object、控制台、登录会话、环境变量和事后事件监听不满足本轮零侵入要求。

## 留待 SHAPE 和技术验证

产品行为已经确定，以下内容仍由后续节点完成，但不得改变上述合同：

- 进程观察结果、停止原因和批量进程实例检查的具体接口；
- deprecated workspace aliases 复用的领域操作及其依赖方向；
- Git for Windows Git Bash 和多套 MSYS 安装并存时的真实运行证据；
- 根据最终实测结果写入文档的环境、版本和能力条件。

## 验收条件

- `current bind` 默认输出紧凑文本，明确表示流程已开始、绑定尚待确认，并给出 confirm、cancel 和过期信息。
- `--print json` 输出项目统一的结构化形式。
- `confirm` 失败后，仍有效的同一个 nonce 可以在独立调用中重试，且原过期时间不延长。
- `cancel <nonce>` 只取消指定待确认记录；`unbind` 只解除正式绑定。
- 在 Windows 上的真实 Pi 环境中，`bind`、`confirm` 和后续调用经过不同临时 shell，仍找到同一个有效共同进程。
- MSYS 支线只在进程表包含当前 CLI Windows PID 时启用；Windows 原生调用不依赖 MSYS。
- MSYS 与 Windows 关系无法可靠接合时，程序明确报告信息不足，不根据猜测创建正式绑定。
- 没有正式绑定记录的隐式业务调用不做不必要的进程观察；仍有正式绑定而观察不足时，命令在发出 SiYuan 请求前失败，并给出显式 workspace 恢复方式。
- 已过期的待确认记录会删除；正式绑定只在 PID 不存在或权威启动标识证明 PID 已复用时自动回收，未知状态保留。
- 进程实例匹配保留既有 PID + 启动标识、必要时 PID + 命令签名的合同，Windows/MSYS 接合使用统一的 Windows 创建时间。
- Windows 原生、Linux 和 macOS 的现有进程关系行为不退化。
- Git for Windows Git Bash 必须在真实环境中完成独立调用验证。
- 最终文档区分实际测试范围和未经验证环境，不把缺少验证写成硬性不支持。
- `.dev/docs/process-binding.md` 能让新的维护者恢复底层限制、方案理由、验证证据、代码权威入口和维护约束，并已加入 `.dev/project.md` Docs Index。
- 最终 SKILL 只说明用户可以依赖的操作、状态和恢复办法，不保留开发包装命令或调查历史。

---
name: process-binding-reliability
summary: 在不改动 Agent 运行框架的前提下，稳定跨平台进程绑定，并整理其状态、输出和代码边界。
updated: 2026-09-07
status: clarifying
---

# 进程绑定可靠性

## 当前状态与材料边界

本 Change 从产品需求和已经验证的运行事实重新开始。外部技术的验证结果见 `process-binding-reliability.TECH-REPORT.md`。

用户已经确认：保留两步进程绑定；允许使用同一个确认码重试；默认输出面向 Agent 使用紧凑文本；MSYS 只是 Windows 捕获器内部按能力启用的支线；源码采用 workspace 领域下独立 `binding/` 子模块的组织方向。

正常业务调用遇到进程关系不确定时如何选择 workspace、死亡正式绑定如何清理，仍需继续确认。因此本文状态仍为 `clarifying`，尚未批准进入正式实现。

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

当前 process binding 已经有完整的功能外形，但还不能在声明支持的运行环境中可靠履行其核心承诺：

> 同一个长期调用者完成两步绑定后，它的后续短命 CLI 调用能够找到同一个绑定；不属于该共同进程范围的其他调用者不受影响；无法取得充分证据时明确失败，不猜测，也不悄悄表现成另一种 workspace 选择。

需要同时解决三组相互关联的问题：

1. **进程观察不可靠。** Windows 原生父进程关系不能恢复已经退出的 MSYS 中间创建者；程序又没有区分“关系正常结束”和“关系中途断开”。
2. **绑定生命周期和输出不清楚。** `bind` 只是开始流程，`confirm` 才会生效，但当前输出、confirm 重试、待确认记录取消以及正式解绑的职责没有形成一套清楚协议；`current` 还绕过项目的 compact/JSON 输出机制而固定输出 JSON。
3. **代码责任分散。** `src/current/` 只有命令外壳，而进程观察、绑定状态和 workspace 解析平铺在 `src/workspace/`；继续增加 Windows/MSYS 支线会进一步放大理解和修改成本。

本 Change 要在不修改 Agent 运行框架、不引入身份服务的前提下：明确绑定成功、失败、重试和恢复行为；让 Windows 原生路径保持主流程、MSYS 按运行能力作为条件支线；并把进程绑定集中到 workspace 领域下独立的 `binding/` 子模块。

完成后的判断标准不是“所有平台都一定能绑定成功”，而是：声明支持的正常环境可以稳定完成并复用绑定；外部信息不足时失败可见且恢复动作明确；不使用进程绑定的路径不被平台支线干扰；源码边界足以让平台观察和绑定协议分别演进。

## 已确认的责任和限制

- 不要求修改 Pi、Claude Code、Codex 或其他 Agent 运行框架。
- 不要求 Agent 生成身份、传递长期环境变量或配合新的调用协议。
- 不引入身份令牌、中间服务或长期运行的辅助进程。
- 继续使用“两次独立调用寻找共同进程”的设计，不把进程关系当成逻辑 Agent 身份认证。
- 临时 CLI、shell 和工具调用进程可以结束。正式绑定应落在两次调用共同看到的稳定进程上。
- `current bind` 只创建一次待确认尝试；只有 `current confirm` 可以创建正式绑定。
- 证据不足时允许绑定失败。
- 不得只凭进程名称选定共同进程，也不得猜测缺失关系后面是谁。
- 新终端或无关进程树不会因为位于同一台机器就继承其他终端的绑定。
- Windows 原生调用是主路径；MSYS 只在运行证据表明当前 CLI 确实属于一套 MSYS 进程表时启用。
- 当前 Pi on Windows + MSYS2 是必测场景。Git for Windows Git Bash 属于预期支持范围，但必须单独实测。
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

### 暂不采用管道进程号

标准输入输出管道另一端的进程号在当前 Pi 环境中能够直接指向 Pi，但重定向、共享读取进程和文档保证仍有未决限制。第一条正式实现路线不使用该信号。

只有真实 Git Bash 验证或后续支持环境证明“MSYS + Windows”两段关系不足时，才重新激活管道路线调查。

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

## 尚未确定

- 正常业务调用遇到明确的进程查询失败，同时本机又存在仍然有效的正式绑定时，应如何退出和提示。
- 如何确认并清理已经死亡或 PID 已被复用的正式绑定记录；该工作是否必须与本轮同时交付。
- 除当前 Pi/MSYS2 和 Git for Windows Git Bash 外，还要声明支持哪些同类环境。
- 合并 MSYS 与 Windows 关系时，进程创建时间和进程号复用的最终核对规则。

## 初步验收条件

以下条件会随尚未确定的行为继续修改：

- `current bind` 默认输出紧凑文本，明确表示流程已开始、绑定尚待确认，并给出 confirm、cancel 和过期信息。
- `--print json` 输出项目统一的结构化形式。
- `confirm` 失败后，仍有效的同一个 nonce 可以在独立调用中重试，且原过期时间不延长。
- `cancel <nonce>` 只取消指定待确认记录；`unbind` 只解除正式绑定。
- 在 Windows 上的真实 Pi 环境中，`bind`、`confirm` 和后续调用经过不同临时 shell，仍找到同一个有效共同进程。
- MSYS 支线只在进程表包含当前 CLI Windows PID 时启用；Windows 原生调用不依赖 MSYS。
- MSYS 与 Windows 关系无法可靠接合时，程序明确报告信息不足，不根据猜测创建正式绑定。
- Windows 原生、Linux 和 macOS 的现有进程关系行为不退化。
- Git for Windows Git Bash 必须在真实环境中完成独立调用验证。
- 最终 SKILL 只说明用户可以依赖的操作、状态和恢复办法，不保留开发包装命令或调查历史。

---
name: caller-current
summary: Give each observable process scope its own current workspace via a two-step process binding, and split catalog commands from selection commands.
updated: 2026-09-05
---

# Process Binding

## Problem Statement

`siyuan-cli` 每次调用都是短命进程。现在要选定用哪个已有 workspace，只有三种办法：

| 机制 | 记住的位置 | 实际后果 |
|---|---|---|
| `--workspace` | 这一条命令 | Agent 每次都要带 |
| `.siyuan-cli.yaml` | 这个目录 | 同目录里的多个 Agent 分不开 |
| `config.current` / `workspace use` | 整台机器 | 多个 Agent 会互相覆盖 |

真正缺的是第四层：**这个调用者进程作用域（可能是 Agent runtime，也可能是一条还活着的交互 shell）当前用哪个已经 `workspace add` 过的名字。**

这不是连不上思源，也不是 `add` / `verify` / `which` 步骤重复。那些是另一件事。这次要做的是：调用者不必每次传参，也不必改全机默认或写项目文件，就能把选择钉在自己的进程作用域上。这里不承诺区分同一进程内的多个逻辑 Agent/session。

成功标准：同一调用者的后续 `api` / `tool` 自动用它 bind 过的 workspace；别的调用者不受影响；项目文件和 bind 指向不同名字时必须报错，不能静默切换。

## Approach

用两次独立调用的进程祖先链，求出还活着的最近共同祖先，把 workspace 名字挂在这个进程实例上。指纹是 pid + 创建时间。这是目前不绑定特定 Agent runtime 的办法：Pi、Codex、Claude Code、人在终端里走同一套。该机制提供的是 process-scoped current，不承诺识别逻辑 Agent session；如果多个逻辑调用者共享这个进程，它们也会共享绑定。

不把进程树当成认证，也不用它管权限、token、approval。bind 只回答“这次用哪个已有名字”。

命令按三层拆开，避免再把“目录里有什么”和“这次用谁”混在 `workspace use` 里：

```text
目录     workspace add / list / show / remove
核验     workspace verify <name|--all>
         current verify
选择     current bind / confirm / unbind
         current global
         current which
```

一次调用只能看到自己的祖先链，分不清哪一截是这个调用者、哪一截是整台机器或宿主共用的，所以 bind 必须是两步。现实中 WT、VS Code、Codex 等大进程完全可能承载多个 Agent；存在共享祖先本身不是异常，问题是候选锚点不能退化到共享宿主。`use-session` 这类一次切台的名字会把协议吃掉，不采用。

v1 不做：把目录/URL 顺手 add 再 bind、`current project`、Pi 的 `PI_SESSION_ID`、签名令牌。项目文件继续手写。

## Behavior Contract

### 选择链

业务命令（`api` / `tool` / `current which` / `current verify`）按下面解析：

```text
--baseUrl / --workspace / $SIYUAN_CLI_WORKSPACE
  → 项目文件 与 caller bind 核对
       只有一个 → 用它
       两个相同 → 用它
       两个不同 → 报错，要求 --workspace 或 unbind
  → config.current
```

`--baseUrl` 仍是 ad-hoc，不走项目文件、不走 bind。  
`workspace add/list/show/remove/verify <name>` 仍只看全局目录，不被当前目录的项目文件或 caller bind 影响。

没跑过 bind 的路径，选择结果与现在一致，只是改全局默认的命令换成 `current global`。

### 绑定协议

只接受已经存在于全局配置里的 workspace 名字。

```text
siyuan-cli current bind home
  → 记下这次祖先链，打印一次性 nonce，要求再开一次独立调用

siyuan-cli current confirm <nonce>
  → 再取祖先链，与 bind 那次求最近共同祖先
  → 选择两次调用最近且仍可识别的共同进程实例
  → 将该进程实例作为 process binding 锚点；不根据进程名称猜测它是否承载多个逻辑调用者
  → 拒绝在同一次进程调用里 confirm
  → 保存 (pid + 创建时间) → home
```

之后同一进程作用域中的 `api` / `tool` 不再需要 `--workspace`。锚点进程退出，绑定失效。新的 bind/confirm 覆盖这个进程作用域上一次绑定。多个逻辑 Agent 若共享同一锚点进程，也会看到同一个绑定；CLI 不宣称能在该进程拓扑下区分它们。

如果两次调用没有可匹配的共同进程实例，bind 失败，不假装绑上；选择退回项目文件 / `config.current` / `NO_WORKSPACE`。同一 OS 进程承载多个逻辑调用者时，它们共享该 process binding；不同 Agent 的快照不得被配成同一次 bind/confirm，nonce 只用于严格配对两次调用。

### 核验

| 命令 | 问的问题 |
|---|---|
| `workspace verify <name>` | 目录里这条连接现在能不能打到 kernel |
| `workspace verify --all` | 目录里每一条 |
| `current verify` | 按选择链，我这次会用哪个名字，那个名字通不通 |

`current verify` 不接受名字。无参 `workspace verify` 报错，提示用上面两套，不再表示“核验当前解析结果”。`workspace verify --global-current` 删除。

`current which` 不联网：输出这次选了谁、从哪来、项目文件路径、若有 bind 则带上锚点信息。kernel 挂了，which 仍能说出身份。

### CLI 输出与 Agent 引导

成功、等待和失败输出都必须让调用者知道下一步可以做什么；不能只输出内部状态。

开始绑定时，输出至少包含：

- 当前尝试绑定的 workspace 名字；
- 需要在新的、独立的工具调用中执行的确认命令；
- nonce 的用途和有效动作；
- 如果 workspace 选错，如何取消 pending binding。

例如：

```text
Process probe captured for workspace "dev".
Run this in a new independent tool call:
  siyuan-cli current confirm <nonce>
If this is not the intended workspace, run:
  siyuan-cli current unbind
```

绑定成功时，输出至少包含：

- 已绑定的 workspace；
- 进程锚点的可诊断信息；
- 后续 `api` / `tool` 可以省略 `--workspace`；
- 如何通过 `current which` 查看、通过 `current unbind` 解除。

失败时，输出必须包含可执行的恢复建议。例如项目冲突应提示绑定同名 workspace，或解除/修改项目文件；共享或不可用的进程锚点应提示重新开始两步流程、改用显式 `--workspace`，或使用项目文件。

### 与现有警告的关系

`IMPLICIT_WORKSPACE` 仍然只在选择来源是 `config.current`、且操作不是低/中风险读取时发出。`process-binding` 和项目文件都不是隐式来源。

### 兼容

| 旧命令 | 行为 |
|---|---|
| `workspace use <name>` | 执行 `current global`，stderr 警告 Deprecated |
| `workspace which` | 执行 `current which`，stderr 警告 Deprecated |

help / 命令列表能藏就藏这些旧子命令；藏不了则标 Deprecated。文档和 SKILL 只教 `current`。Agent 不要用 `current global` / `workspace use` 给自己选 workspace。

stdout/stderr 仍是：成功结果在 stdout（workspace/current 管理命令为 JSON），错误为 stderr 单行 JSON，exit `2` 表示配置/选择问题。

### 平台

v1 必须 Windows 和 Unix 都能 bind。MSYS/Git Bash 仍走 Windows 进程树，不能当 Unix 实现。Unix 祖先链和指纹必须先在真 Linux 上 spike，再写实现。spike 未通过前，不能把 Unix bind 做成空壳成功。

## Implementation Decisions

- 身份键是进程锚点，不是 runtime 注入的 session id；能力名称和输出使用 process binding，避免暗示逻辑 session 隔离。
- bind 的对象是已有命名 workspace，不是路径或 URL。
- 项目文件和 bind 可以同时存在；指向不同名字时硬报错，不默默分胜负。
- 选择从目录命令里拆到顶层 `current`。`workspace use` 的语义（写 `config.current`）改由 `current global` 承担，不把裸 `use` 改成 session bind。
- `current project` 不做。
- 进程锚点不是权限系统；permission / token / approval 仍跟被选中的那个 workspace 走。
- 进程祖先探测的跨平台接口已经由 spike 验证方向；pending probe 的存放位置和过期时间、绑定记录的存储格式仍属于实现设计。不能因为 WT/VS Code/Codex 等进程名出现在祖先链中就一律失败，也不要求实现猜测某个共同进程是否服务多个逻辑调用者。SPEC 不预先规定存储格式。

## Acceptance Criteria

技术上可执行：

- 两次独立调用 `current bind <已有名字>` → `current confirm <nonce>` 之后，`current which` 的 `source` 为 `process-binding`，`workspace` 为该名字，并显示进程锚点信息。
- 同一进程作用域随后的 `api` / `tool` 不再需要 `--workspace`，解析到同一名字。
- 另一个不包含该进程锚点的进程作用域，不会解析到这个 bind；同一 OS 进程承载的多个逻辑调用者不属于此保证。
- 项目文件与 bind 名字不同：`current bind` 立即以配置错误退出，不创建 pending；若两步之间项目文件发生变化，`current confirm` 也以配置错误退出；业务命令仍做最终防御性检查，不执行请求。
- 项目文件与 bind 名字相同：正常使用该名字。
- 无项目文件、无 bind：仍落到 `config.current`；写操作仍发 `IMPLICIT_WORKSPACE`。
- `current bind` 一个不存在的名字：`WORKSPACE_NOT_FOUND`。
- 同一次进程调用里 `confirm`：失败。
- 两次调用没有可匹配的共同进程实例：失败，不写入绑定；共同进程是否还承载其他逻辑调用者不由 CLI 猜测。
- `current bind` 在当前 cwd 已有项目文件且名字不一致：立即失败，不写入 pending；confirm 阶段仍重新检查。
- 锚点进程已退出：绑定不再生效。
- `workspace verify` 无参：失败并提示；`workspace verify home` 不读项目文件、不读 bind。
- `current verify` 带名字：失败。
- `workspace use` / `workspace which` 仍能跑，stderr 有 Deprecated 警告；`--help` 默认列表里看不到它们（若 citty 限制导致必须显示，则标 Deprecated）。
- Windows 与 Unix 都有通过的祖先链 spike 记录，且 bind 在两边都能完成上述成功路径。

需要人看的：

- 打开 [prototype/index.html](prototype/index.html)，走完「推荐绑定」「项目文件冲突」「共享祖先失败」三条，确认命令文案、报错时机和 `which` 输出是想要的产品形态。
- Unix spike 在真 Linux 上跑过，而不是 MSYS。

## Open Questions

以下事项不再是需求 blocker，留给实现设计和测试：

- pending probe / 生效绑定存在哪、如何过期清理。
- Windows 与 Unix 的进程探测 API 封装。
- 如何从祖先链选择最近共同进程，以及如何检测锚点是否仍存活。
- 绑定记录并发写入、重复绑定和旧进程指纹失效时的具体处理。
- Codex 的多个逻辑 session 已验证可能共享同一 Codex 进程；因此产品合同不承诺 session 粒度隔离。需要更细隔离时使用显式参数、项目文件或未来 runtime context。

## Closure

本 SPEC 已闭合需求与方向性设计：软件提供的是 process binding，不是 session identity 或 authentication。剩余开放项都是实现边界、持久化细节或平台适配，不改变已确认的用户可观察目标；若实现发现其中任何一项会改变绑定作用域、选择优先级、冲突行为或失败责任，必须回到本 SPEC 重新确认。

## Terminology

- **进程作用域 current**：这次 CLI 进程所属的可观察进程作用域所选定的 workspace 名字。它不是逻辑 Agent session 的身份，也不是全局 `config.current` 或项目文件。
- **进程锚点**：两次独立调用的最近、稳定共同祖先进程，用 pid + 创建时间标识。绑定挂在这个进程实例上，进程退出即失效；更高层的 WT、VS Code、Codex 或 systemd 可能承载多个逻辑调用者，不能自动宣称拥有 session 粒度。
- **进程绑定（process binding）**：把 workspace 选择附着到进程锚点的机制。它能消除每次调用传参的需要，但只提供该进程作用域的隔离；同一 OS 进程内的逻辑调用者可能共享它。它不是认证，也不是逻辑 Agent/session 的通用身份机制。
- **观察到的 cwd**：bind 时记录的工作目录上下文，可用于 `current which` 诊断或未来的显式目录约束；它不是进程身份，也不参与绑定匹配。
- **目录**：全局配置里有哪些 workspace、它们怎么连。对应 `workspace add/list/show/remove`。
- **选择**：这次调用用哪个名字、这个决定记在哪。对应 `current *`。
- **`current global`**：写入全局 `config.current` 的命令，语义等于现在的 `workspace use`。
- **`process-binding`**：`ResolvedWorkspace.source` 的候选取值，表示选择来自进程绑定。实现时若改名，文档与 `which` 输出必须一起改。
- **nonce**：`bind` 发给 `confirm` 的一次性配对码，用来避免两个并发调用者的祖先链被配错。不是长期凭证。

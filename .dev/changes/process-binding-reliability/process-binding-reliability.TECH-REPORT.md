---
name: process-binding-reliability-technical-report
summary: Windows/MSYS 环境中零侵入进程关系恢复的验证结果、能力边界和技术约束。
updated: 2026-09-08
status: complete
---

# 进程绑定可靠性技术报告

## 报告范围

本次 SPIKE 只回答一个技术问题：

> 一个短命的 CLI 进程不要求 Agent 运行框架配合，能否在 Windows/MSYS 环境中可靠找到发起调用的长期 Agent 进程？

报告说明外部技术能做到什么、不能做到什么，以及各种路线的限制。它不决定最终产品行为，也不批准正式实现。产品需求仍由 `process-binding-reliability.DEV-SPEC.md` 和后续讨论确定。

## 结论

1. **只查 Windows 进程关系不能解决问题。** Windows 只在当前进程上保留一个创建者进程号。中间创建者退出后，普通查询接口不能事后恢复它原来的上级进程。
2. **当前 Pi + MSYS2 环境中，所需关系仍然可以恢复。** MSYS 自己维护 CLI 与 shell 的逻辑父子关系，并提供对应的 Windows 进程号；走完 MSYS 这一段后，可以切回 Windows 关系继续找到 Pi。
3. **两个独立 Pi Bash 工具调用已经找到同一个 Pi Node 进程。** 每次调用的 CLI、`sh` 和外层 `bash` 都不同，但两条合并后的关系在 Pi 进程处相交。这符合现有两步绑定设计。
4. **真实 Git for Windows 运行时也验证了同一路线。** 一个长期 Git Bash harness 通过 npm-shim 形态的入口先后启动两次本仓库 CLI；两次 CLI 的 Windows PID 和 MSYS PID 均不同，Git 的进程表都能把它们接到同一个仍存活的 Git Bash 实例，再从该实例的 Windows PID 接回同一条 Windows 关系。
5. **完整协议已经在真实运行时通过。** Pi/MSYS2、Git for Windows Bash 和原生 Windows PowerShell 都完成了独立 bind/confirm、which、cancel 与 unbind；真实 `dev` 配置还完成了只读 verify 和业务请求。两个并存的原生 shell scope 能各自选择 workspace，且 unbind 只删除当前 scope 的记录。
6. **继承的标准输入输出管道可能提供一条更短的辅助证据。** 在当前 Pi 环境中，两次独立调用都从继承的标准错误管道查到同一个 Pi 进程号。但该接口的文档保证、重定向行为和不同运行框架下的范围都不足以支撑它单独承担绑定。
7. Job Object、控制台进程列表、Windows 登录会话、环境变量、事后启动的事件监听等路线都不能在现有限制下唯一、稳定地表示同一个 Agent。
8. 因此，当前需求在技术上**不是做不到**。已验证的主要路线是“MSYS 逻辑关系 + Windows 原生关系”；管道另一端的进程号可作为补充证据或快速线索，但不能直接取代进程关系。

## 验证环境

- Windows 10 专业版，版本 `10.0.19045.6466`；
- 当前 Pi 的 Bash 工具运行在 MSYS2，`ps` 版本 `3.6.7`；
- Git for Windows 安装在 `G:\Enviroment\Git`，Git Bash 为 GNU Bash `5.2.26`，所带 `ps` 版本 `3.4.10`；
- Windows PowerShell `5.1.19041.6456`；
- Node.js `24.12.0`，pnpm `10.24.0`；
- 本仓库构建产物 `siyuan-cli 0.17.0-dev.2`；
- N7 的真实只读请求目标为 dev SiYuan `3.8.2`；
- N2 技术实验没有修改正式代码；N7 验证的是实现基线 `ca2850e`，其后的并行提交只涉及 `.dev/` 文档。

Git for Windows 已在真实运行时中完成长期 caller 下的完整绑定流程。当前 Pi 会话本身仍使用 MSYS2 工具 shell；“Pi 被配置为直接使用 Git Bash”没有在本次实验中声称已经验证，也不是判断 Git 运行时、进程表和 Windows handoff 是否成立所必需的条件。

## 当前实现为什么失败

`src/workspace/process-tree.ts` 的 Windows 实现先运行：

```powershell
Get-CimInstance -ClassName Win32_Process
```

然后从 CLI 进程开始，按每个进程的 `ParentProcessId` 向上查。父进程号不在清单中时，当前代码直接停止：

```powershell
if ($null -eq $proc) { break }
```

这隐含了一个不成立的前提：只要当前进程仍然活着，它的每一级创建者也都能在当前清单中查到。

微软文档明确说明：`ParentProcessId` 指向的进程可能已经退出，也可能因为进程号复用而错误地指向另一个进程。Windows 不会在创建者退出后把该字段改成更上一级进程，也不保存一条可供事后查询的完整祖先历史。

本次调查在当前环境中反复观察到类似关系：

```text
CLI node → sh.exe → sh.exe → 一个已经找不到的进程号
```

Pi 仍然运行，但 Windows 关系在到达 Pi 之前已经断开。

## Windows 原生接口的能力边界

| 信息源 | 能提供什么 | 中间进程退出后能否恢复更上级关系 |
|---|---|---|
| `Win32_Process.ParentProcessId` | 存活进程的创建者进程号、创建时间、名称等 | 不能 |
| Tool Help 的 `th32ParentProcessID` | 存活进程的创建者进程号 | 不能；而且自身不提供创建时间 |
| `NtQueryInformationProcess` 的 `InheritedFromUniqueProcessId` | 存活进程内部记录的创建者进程号 | 不能；仍然只有一跳 |
| 预先持有的进程句柄 | 父进程退出后仍可读取该进程对象中的创建者进程号和时间 | 可以继续读一跳，但 CLI 无法预先持有自己启动前就存在的短命辅助进程句柄 |
| WMI/ETW/安全审计事件 | 进程创建发生时的进程号和创建者进程号 | 必须提前监听或开启审计，部分接口还需管理员权限 |

三个常见父进程接口返回的是同一种创建期信息。换用更底层的 Windows 接口可以提高创建时间精度，不能恢复已经消失的中间进程原来的父进程。

已退出进程如果事先没有被监听、记录或持有句柄，Windows 原生接口无法事后补回它的上级关系。这是外部技术限制，不是多写一层循环可以解决的问题。

### Windows 仍然适合承担的部分

Windows 关系在进程都仍然存在时是有效的，仍适合：

- 查询 MSYS 之外的原生 Windows 进程；
- 从最外层 MSYS 进程继续找到 Pi、Code 或终端进程；
- 取得同一来源的进程创建时间，配合进程号识别进程实例；
- 检查父进程创建时间是否早于子进程，排除明显的进程号复用错接。

## MSYS 提供的另一条关系

MSYS 为了在 Windows 上模拟 Unix 进程，维护自己的进程表。长格式 `ps` 输出包含：

- MSYS 进程号；
- MSYS 父进程号；
- 进程组；
- 对应的 Windows 进程号。

MSYS 的逻辑父子关系与 Windows 的创建者关系不是同一张表。`exec` 等行为可能替换 Windows 进程，但保留 MSYS 的逻辑进程号；MSYS 父进程结束后，子进程的逻辑父进程号可以改为 `1`。因此，Windows 关系留下数字空洞时，MSYS 关系仍可能连续。

### 实际关系

一次出现 Windows 断链的调用中，Windows 看到：

```text
CLI node 51876
  → sh.exe 44932
  → sh.exe 47460
  → 46120（已找不到）
```

同一时刻，MSYS 看到：

```text
CLI node 51876
  → sh.exe 47460
  → 外层 bash.exe 52392
```

从 `bash.exe 52392` 的 Windows 进程号重新使用 Windows 关系：

```text
bash.exe 52392
  → node.exe 41904    ← Pi
  → Code.exe
```

合并后得到：

```text
CLI 51876
  → MSYS sh 47460
  → 本次 Bash 工具进程 52392
  → Pi 41904
```

另一次独立 Bash 工具调用使用的是不同外层 bash，但仍然到达同一个 Pi 进程 `41904`。这些数字只是该次实验样本，不能写入正式逻辑；重要的是两次临时进程不同而长期 Pi 进程相同。

### Git for Windows 两次独立调用验证（N2）

N2 在真实 `G:\Enviroment\Git\bin\bash.exe` 中启动一个长期存活的 Git Bash harness。Harness 通过 npm-shim 形态的 shell 入口（最终 `exec node .../bin/siyuan.mjs`）先后运行两次本仓库构建后的 `siyuan-cli --version`。只读 preload hook 在实际 CLI Node 进程中同步采集 Git `ps -e -l`、另一套 MSYS2 的 `ps -e -l` 和 Windows CIM 快照；实验文件位于临时目录，没有修改生产代码或绑定状态。

两次调用的关键样本如下：

| | 第一次调用 | 第二次调用 |
|---|---:|---:|
| CLI Windows PID | `55376` | `3296` |
| CLI Git/MSYS PID | `1789` | `1798` |
| Git/MSYS parent PID | `1782` | `1782` |
| 共同 Git Bash Windows PID | `57520` | `57520` |
| 共同实例 Windows start ID | `639244097469535490` | `639244097469535490` |
| 纯 Windows 关系停止点 | missing `52020` | missing `19888` |

两条纯 Windows 关系分别在 `node.exe → sh.exe` 后遇到不同的已退出 creator，均未到达长期 harness。Git `ps -e -l` 则把两个不同的 CLI 逻辑进程都接到 MSYS PID `1782`；该记录映射到仍在 Windows CIM 快照中的 `bash.exe` PID `57520`。从这个 handoff 实例继续查询 Windows 关系，两次得到相同的后续链。PID 与 start ID 都相同，证明交点是同一个仍存活的进程实例，而不是仅仅复用了数值 PID。

这次实验同时验证了多安装隔离：

- 两次 Git Bash 调用中，由 PATH 解析到的 `ps 3.4.10` 和显式核对的 Git `ps` 都包含当前 CLI WINPID；独立 MSYS2 的 `ps 3.6.7` 都不包含；
- 反向控制调用从 MSYS2 发起时，PATH 解析到 `ps 3.6.7`，MSYS2 表包含当前 WINPID，而 Git 表不包含；
- 因此应以“进程表是否包含当前 CLI WINPID”选择 owning runtime，不能因为 PATH 上存在某个 `ps` 或产品名称相似就采用其关系。

输出格式方面，Git `ps 3.4.10` 的 `ps -e -l` 提供 `PID PPID PGID WINPID ...`，而组合写法 `ps -efl` 输出另一种格式且没有 WINPID。此次非 TTY 调用中，把 `COLUMNS` 设为 `20` 没有复现截断，输出宽度与 `4096` 时相同；这不推翻此前环境中观察到的截断差异，因此实现仍应清除或设置足够大的 `COLUMNS`，并以表头和必需数值列校验实际输出，不能依赖固定空格位置。

N2 由此关闭了 Git for Windows 运行时的关键技术缺口：两次真实 Git Bash CLI-shaped 调用能够通过 owning MSYS 表和 Windows handoff 找到同一个长期 caller。该结论只覆盖上述实测环境与调用拓扑，不把其他平台或版本写成硬性不适用。

### 完整协议运行验证（N7）

N7 使用构建后的 `node bin/siyuan.mjs`，没有调用全局 CLI。除一次经授权的真实 `dev` 只读流程外，状态和 catalog 均位于隔离的 `SIYUAN_CLI_CONFIG`。

- Pi/MSYS2 的 bind 与 confirm 来自两个独立工具调用，最终选择同一个长期 Pi Node 实例；记录的 start ID 与独立 CIM 查询得到的 UTC ticks 完全相同。
- Git for Windows 长期 Bash harness 通过 npm-shim 形态入口完成 bind、confirm、which、confirmed-only unbind 和 targeted cancel。PATH 选中的 Git `ps 3.4.10` 含当前 WINPID，独立 MSYS2 `ps 3.6.7` 不含；anchor 为长期 Bash 实例。
- 原生 PowerShell 长期 caller 完成四次独立调用，anchor 的 PID/start ID 与预先记录的 CIM 实例相同；该路径不调用 `ps`，也不依赖 MSYS。
- 两个同时存活的原生 shell scope 在同一状态目录中持有两个 confirmed records，各自解析到自己的 workspace。第一个 scope 的 unbind 只删除自己的记录，另一个 scope 随后仍能解析其 workspace。
- 同一 nonce 在项目冲突失败后保留，错误包含 retry/cancel 和 `requestSent: false`；修复冲突后可用原 nonce 确认，`createdAt` 与文件 mtime 没有延长。取消、过期、PID 缺失和权威 start ID 不同的回收行为均符合合同。
- 一个 live 但身份不足的 retained anchor 在真实 Pi/MSYS2 与原生 PowerShell topology 中触发 `PROCESS_BINDING_OBSERVATION_INSUFFICIENT`；业务调用在联网前退出并保留记录。相同状态下三个显式 selector 均绕过观察并实际走到网络错误，形成对照。
- 没有 confirmed record 时，即使让 `powershell.exe` 无法从 PATH 解析，`current which` 仍正常走 global；加入记录后同一环境明确报告观察失败，证明“无记录跳过观察”和“查询失败不等于 absence”都成立。
- 真实配置完成 bind/confirm、`current verify` 和只读 `api system.version`，随后 unbind；真实 pending/bindings 恢复为空，项目文件恢复到原 blob。

所有实测 Windows caller 的 native tail 都在已退出 creator 处停止，因此完整关系上的 conclusive no-match 没有真实触发；该分支由确定性 fixture 保护。这是本机这些 topology 的测量结果，不是 Windows 的普遍结论，也不能据此放宽 insufficient 的 fail-loud 合同。

第一次“双终端”尝试实际使用两个共享 VS Code host chain 的集成终端，不能证明 host isolation，因而不作为该声明的证据。后续并存记录和精确 unbind 的声明只依赖两个不同、仍存活的 shell anchor 及 CLI 输出，不依赖产品名称来判断 scope。

### 可以采用的接合方式

技术上可按以下方式恢复关系：

1. 运行属于当前 MSYS 安装的 `ps`；
2. 在 MSYS 表里找到 Windows 进程号等于当前 CLI 进程号的记录；
3. 按 MSYS 父进程号向上走到该表的边界；
4. 使用边界进程对应的 Windows 进程号，继续沿 Windows 关系向上查；
5. 合并两段结果；
6. 任一步无法核对时，报告查询失败，不猜测缺失部分。

这里不是逐项修补 Windows 断掉的那条链。MSYS 提供的是另一条逻辑关系，程序用它绕过短命 Windows 辅助进程，然后在双方都能识别的进程号处切回 Windows。

## 读取 MSYS 进程表的约束

这条路线已经可行，但正式实现必须处理以下限制。

### 必须选中正确的 MSYS 安装

不同 MSYS2、Git Bash 或 Cygwin 安装各有自己的进程表。程序应使用当前调用环境 `PATH` 中的 `ps`，然后确认当前 CLI 的 Windows 进程号确实出现在该表中。找不到时不能拿另一套 MSYS 的表猜测。

### 使用跨版本一致的命令形式

当前 MSYS2 `3.6.7` 中，`ps -efl` 会输出 Windows 进程号；Git Bash 所带 `3.4.10` 中，同一个写法会切换成另一种格式，不再输出 Windows 进程号。

两边实测都能使用：

```bash
ps -e -l
```

因此不能依赖 `ps -efl`，也不能假定选项顺序在各版本中含义相同。

### 输出可能被终端宽度截断

`ps` 会读取 `COLUMNS`。数值太小时，一整行会被静默截断，甚至丢掉 Windows 进程号。程序调用时必须清除该变量或设置足够大的值，并检查表头和每行必需字段。

### 解析不能只按空格位置硬切

- 某些进程状态会在行首增加一个状态字符；
- 时间字段可能包含空格；
- 已退出但尚未清除的记录可能带 `<defunct>`；
- 老版本和新版本的 MSYS 进程号范围不同。

程序应核对表头和数值列，只使用进程号、父进程号和 Windows 进程号；不能依靠命令路径识别身份。

### 进程实例仍要用 Windows 时间核对

MSYS 关系用于确认“谁是逻辑父进程”，进程实例身份仍应使用 Windows 进程号和统一来源的创建时间。不能把 CIM、`GetProcessTimes` 等不同精度的原始时间字符串直接混用，否则同一进程可能因末位精度不同而匹配失败。

## 标准输入输出管道提供的辅助证据

Windows 的 `GetNamedPipeServerProcessId` 可以查询命名管道服务端的进程号。

在当前 Pi 环境中，让 PowerShell 辅助进程继承 CLI 的标准错误句柄后，两次独立调用得到：

```text
第一次 CLI：52028
标准错误管道服务端：41904（Pi）

第二次 CLI：39856
标准错误管道服务端：41904（Pi）
```

标准输出由 CLI 自己创建管道捕获，所以查询到的是 CLI 自己；标准错误直接继承自 Pi，因此查询到 Pi。这个结果说明，某些运行框架的输入输出连接本身可以直接指向长期调用者。

但它目前只适合作为补充证据：

- 输出被重定向到文件时，不再是管道；
- 经过额外管道或读取进程时，另一端可能是临时 shell 或共享读取进程；
- 某个运行框架可能让多个 Agent 共用同一个读取进程；
- 微软文档要求传入由 `CreateNamedPipe` 创建的管道句柄，而实验传入的是继承句柄；当前系统调用成功，但文档没有保证这种用法在所有环境中成立；
- Node.js 没有直接提供该查询，需要 PowerShell 或本机扩展协助。

因此，管道进程号可以帮助确认或加速查找，是否把它纳入正式绑定证据需要在产品和实现设计阶段另行决定。

## 已排除或不满足当前限制的路线

| 路线 | 不适用原因 |
|---|---|
| 延长中间进程寿命 | 丢失的是 MSYS 内部辅助进程，不由 CLI 创建或控制；正常 shell 本身往往仍然活着 |
| Job Object | 当前环境中 CLI 和 Pi 不在同一个可查询 Job；CLI也无法取得未知、未命名的上级 Job 句柄 |
| 控制台进程列表 | 每次 Bash 工具调用得到新的控制台成员，只覆盖当次临时进程，通常不包含 Pi |
| Windows 登录会话 | 粒度过大，同一登录用户的多个终端和 Agent 都会被并在一起 |
| Windows 进程组或窗口站 | 不能提供与一个 Agent 一一对应、跨工具调用稳定的标识 |
| Agent 环境变量 | 要么没有可用标识，要么依赖 Agent 主动提供，违反不修改运行框架的限制 |
| WMI/ETW/安全审计 | 需要在进程创建之前启动监听或审计，部分方式还要求管理员权限 |
| 按进程名或命令行猜测 | 可能把多个 Agent 或终端误认为同一个，不能作为绑定依据 |
| Agent 主动声明身份或常驻中间服务 | 能解决身份问题，但改变了产品前提，不属于本轮零侵入方案 |

## 对现有绑定状态的约束

技术调查同时澄清了“绑定失败后如何清理”的问题。

### 第一次查询就失败

如果 `current bind` 连第一份可靠进程关系都没有取得，不应创建待确认记录，因此没有东西需要清理。

### `bind` 已创建待确认记录，但 `confirm` 失败

此时尚未选出正式绑定进程。留下的是以确认码标识的待确认记录，不是某个进程的绑定。重试或取消应使用确认码，不应依赖再次找到一个从未成功绑定的进程。

当前 `current unbind` 会先查询进程关系，再删除所有待确认记录。如果未来把进程查询失败改成明确报错，这个顺序可能导致待确认记录无法清理。正式设计需要拆开或调整这两个动作，但本报告不决定命令名称。

### `confirm` 已成功

正式记录绑定到共同进程。解除绑定需要当前调用再次找到这个进程。如果已验证场景中的进程查询本身失败，应先报告查询失败，而不是把“没查到绑定”和“查找过程没完成”混为一件事。

反过来，仅仅发现某条正式绑定记录没有匹配当前调用，并不能证明当前调用原本属于该绑定；程序不能据此猜测 Agent 身份。

## 技术路线评估

### 路线一：Windows 原生关系 + MSYS 逻辑关系

- 当前 Pi/MSYS2 环境已经证明能够到达同一个 Pi 进程；
- 不要求修改 Agent 运行框架；
- 保持现有“两次调用找共同进程”的核心设计；
- 新成本主要是外部 `ps` 调用、版本兼容、两段关系接合和失败报告；
- 这是当前证据最充分的路线。

### 路线二：在路线一上增加管道进程号

- 当前 Pi 环境里可直接得到 Pi 进程号；
- 可以作为第二份证据、快速线索或交叉检查；
- 管道重定向、共享读取进程和文档保证不足会扩大需要测试的情况；
- 是否纳入取决于产品愿意承担多少环境适配和证明成本。

### 路线三：只修 Windows 原生查询

- 可以改善创建时间精度和错误识别；
- 无法恢复已经退出的中间进程原来的父进程；
- 不能满足已确认的 Windows/MSYS 验证目标。

## 集成验证后的边界

N7 已完成实现、fixture 和真实运行时验证。Windows 创建时间来源、Git/MSYS 表格解析、多安装归属、handoff 失败、PID reuse、状态生命周期和完整协议均有对应证据。当前 ancestry 路线在要求验证的环境中成立，因此不激活管道进程号候选路线。

仍需诚实保留两个边界：本轮没有让 Pi 自身改用 Git Bash 工具 shell；Linux/macOS 保留既有 fixture 成功行为，但没有完成本轮真实运行时验证。两者都应写成未验证范围，而不是硬性不支持。

产品行为由 accepted DEV-SPEC 和最终代码决定；本报告中的技术发现不得自行扩大或缩小持久文档声称的实测范围。

## 主要外部依据

- Microsoft Learn：[Win32_Process](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process)
- Microsoft Learn：[PROCESSENTRY32W](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/ns-tlhelp32-processentry32w)
- Microsoft Learn：[NtQueryInformationProcess](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntqueryinformationprocess)
- Microsoft Learn：[GetNamedPipeServerProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeserverprocessid)
- Microsoft Learn：[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- Microsoft Learn：[GetConsoleProcessList](https://learn.microsoft.com/en-us/windows/console/getconsoleprocesslist)
- Microsoft Learn：[Consuming ETW Events](https://learn.microsoft.com/en-us/windows/win32/etw/consuming-events)
- MSYS2 runtime `8fbd9808447ee78ed485deead9b79cd1e40c07b7`：`winsup/utils/ps.cc`、`winsup/cygwin/pinfo.cc`、`spawn.cc`、`sigproc.cc`
- Git for Windows runtime `710e5275eb86d54b45b5f4d71ecc4e1cac1b9302`：对应文件与本次读取的 MSYS2 版本在核心进程表逻辑上相同

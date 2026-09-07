# MSYS 进程关系与 Windows 进程号的对应

## 这项调查为哪个决定服务

`siyuan-cli` 需要在两个独立的 Agent 工具调用中找到同一个长期 Agent 进程。当前 Pi 运行在 Windows 上，Bash 工具由 MSYS 提供；CLI 不得要求 Pi 配合传递身份。

只看 Windows 的 `ParentProcessId` 时，CLI 到 Pi 的关系有时会被 MSYS 的短命辅助进程截断。一次本机初步实验发现，MSYS 的 `ps -efl` 仍能显示 CLI、`sh` 和外层 `bash` 的逻辑父子关系，并提供每个进程对应的 Windows PID。由外层 `bash` 的 Windows PID 再按 Windows 关系查询，可以到达 Pi 的 Node 进程。

本调查要确认：这是 MSYS 有意提供且可以依赖的关系，还是当前环境中的偶然表现；Git for Windows Git Bash 是否具有相同能力。

## 已知代码和规格

- 当前进程捕获代码：`src/workspace/process-tree.ts`
- 本轮需求边界：
  `.dev/changes/process-binding-reliability/process-binding-reliability.DEV-SPEC.md`

请先阅读这两个文件。旧 `caller-current` 材料和 LAI #11 只属于历史，不作为需求。

## 已观察到的本机现象

在同一次调用中，Windows 关系曾表现为：

```text
CLI node → 短命 sh → 仍存在的 sh → 已找不到的父进程
```

同一时刻，`ps -efl` 表现为：

```text
CLI node → 仍存在的 sh → 外层 bash
```

`ps -efl` 同时给出 MSYS PID、MSYS PPID 和 Windows PID；从外层 bash 的 Windows PID 继续查 Windows 关系，可以到达 Pi Node。不同 Pi Bash 工具调用的外层 bash 不同，但上方 Pi Node 相同。

这些只是本机观察，调查必须寻找能说明其含义和稳定性的独立依据。

## 必须回答的问题

1. MSYS/Cygwin `ps` 输出中的 PID、PPID、PGID、WINPID 分别表示什么；
2. MSYS 的逻辑父子关系为何可能与 Windows `ParentProcessId` 不同；
3. fork/spawn 过程中是否会产生不属于逻辑进程树的短命 Windows 辅助进程；
4. 一个由 MSYS 启动的原生 Node 进程，是否会稳定出现在 MSYS 进程表中；
5. 能否沿 MSYS PPID 找到最外层 MSYS 进程，再用 WINPID 接回 Windows 关系；
6. PPID 为 1 或 0 时分别意味着什么，是否能据此判断切换点；
7. `ps -efl` 的输出格式、可用性和版本差异是否适合程序读取；
8. 独立 MSYS2、Git for Windows Git Bash、Cygwin 在这些行为上有哪些已知差异。

## 不能做的事

- 不修改仓库文件；
- 不决定最终产品行为；
- 不把当前机器的一次现象推广到所有 MSYS/Git Bash；
- 不使用旧 issue 的推测替代证据；
- 不假设子 Agent 看过主对话。

## 证据要求

优先使用 MSYS2/Cygwin/Git for Windows 官方文档、源码、man page 或可以复现的本机命令。关键结论必须带链接、源码位置或命令。事实、推断和未验证项分开写。

## 返回格式

1. 先给直接结论：MSYS 关系是否有望作为可靠补充；
2. 解释 PID/PPID/WINPID 的实际关系；
3. 列出可以依赖的部分和版本风险；
4. 列出必须在真实 Git Bash 或其他环境继续验证的项目。

控制篇幅，输出应能直接进入技术汇报。
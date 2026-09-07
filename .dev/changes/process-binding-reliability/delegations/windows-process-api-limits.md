# Windows 进程接口的能力边界

## 这项调查为哪个决定服务

`siyuan-cli` 的进程绑定功能要从两个独立、短命的 CLI 调用中找到同一个长期 Agent 进程。CLI 不能要求 Agent 运行框架传身份、设置变量或启动常驻服务，只能在每次调用时读取现有系统信息。

当前 Windows 实现一次读取 `Win32_Process`，从当前 CLI 的 `ParentProcessId` 开始逐层向上查询。在 Windows + MSYS 环境中，某个仍然存在的 `sh.exe` 可能把一个已经找不到的短命辅助进程记为父进程，导致查询在到达长期 Agent 进程之前停止。

本调查要回答：只使用 Windows 原生接口，能否在中间创建进程已经退出后恢复更上层的进程关系？答案将决定我们是否能单独改进 Windows 查询，还是必须使用 MSYS 自己的进程记录。

## 已知代码位置

- `src/workspace/process-tree.ts`
  - Windows 实现使用 `Get-CimInstance Win32_Process`；
  - 在父进程号不在快照中时直接停止；
  - 进程实例目前用 PID + 创建时间辨认，拿不到创建时间时才退到 PID + 命令签名。
- 本 Change 的问题边界见：
  `.dev/changes/process-binding-reliability/process-binding-reliability.DEV-SPEC.md`

请先阅读上述两个文件，但不要把旧 `caller-current` 材料或 LAI #11 当作需求。

## 必须回答的问题

分别调查下列 Windows 信息源：

1. `Win32_Process.ParentProcessId`；
2. Tool Help 快照中的 `th32ParentProcessID`；
3. `NtQueryInformationProcess` 返回的 `InheritedFromUniqueProcessId`；
4. 已有进程句柄能否在父进程退出后取得祖父进程；
5. WMI/ETW 的进程创建事件是否必须提前监听；
6. Job Object、控制台进程列表等接口是否能在不要求 Agent 配合的前提下唯一表示同一个 Agent。

对每个信息源说明：

- 实际保存或返回的是什么；
- 父进程退出后还能查到什么；
- 能否恢复已经消失的中间进程原来的父进程；
- 是否需要提前持有句柄、监听事件或修改 Agent；
- PID 复用会带来什么限制。

## 不能做的事

- 不修改仓库文件；
- 不设计产品行为；
- 不把“理论上可能”写成“已经可用”；
- 不用进程名称或命令行相似度作为可靠身份；
- 不假设子 Agent 看过主对话。

## 证据要求

优先使用微软文档、公开头文件、可靠源码或可以复现的本机命令。每项关键结论给出链接、文件位置或命令。若无法找到直接证据，明确写“推断”及推断依据。

## 返回格式

1. 先用三到五句话给直接结论；
2. 按信息源列出能力和限制；
3. 最后写出：
   - Windows 原生接口确定能做到什么；
   - 确定不能事后恢复什么；
   - 哪些结论还需实验验证。

控制在技术汇报可直接引用的篇幅内。
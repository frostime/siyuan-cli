请只做一次进程祖先链技术测试，不要修改任何文件，不要分析结果。

在你当前的 Agent session 中，通过 3 次彼此独立的 shell/bash 工具调用，分别运行：

python3 .dev/changes/caller-current/prototype/process-anchor-spike.py

如果当前环境是 Windows，也可以运行：

python .dev/changes/caller-current/prototype/process-anchor-spike.py

要求：

1. 三次运行必须由同一个 Agent session 发起；
2. 必须是三次独立的 shell 工具调用，不要在一次 shell 中连续执行三次；
3. 不要通过 SSH；
4. 不要把三次命令合并成一个脚本；
5. 不要修改或删除任何文件；
6. 请原样返回三次脚本 stdout；
7. 额外说明你使用的是 Codex 还是 OpenCode，以及运行平台。

测试完成后，只返回三次原始 JSON 输出和平台名称。

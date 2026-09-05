# process-binding prototype

这是产品行为原型，不是生产实现。它只用固定的模拟状态，让评审者检查命令面、进程绑定和外部行为。

## Review

直接打开 `index.html`，依次检查：

1. 选择 `home`，点击 `current bind <workspace>`；再点击 `current confirm <nonce>`。
   - 应先看到一次性 nonce，再看到绑定成功。
   - `current which` 应显示 `source: process-binding`。
2. 将“项目文件”改为与绑定不同的 workspace，再点 `current which` 或 `current verify`。
   - 应看到 `CURRENT_SELECTION_CONFLICT`，不能静默选择其中一个。
3. 点击“模拟：只能找到共享宿主”，重复 bind/confirm。
   - confirm 应失败，不创建 binding。
4. 将项目文件改为与绑定相同的 workspace。
   - `current which` / `current verify` 应恢复成功。
5. 点击 `current unbind`。
   - 解析应回到项目文件；没有项目文件时回到 global current。
6. 选择一个不可达的 workspace，分别比较：
   - `workspace verify <name>`：只检查这个名字；
   - `current verify`：检查选择链最终得到的名字。

## What this does not prove

- 不读取真实进程树。
- 不证明 Windows / Linux 的 PID 指纹、并发或生命周期正确。
- 不决定 pending probe 和 binding 的生产存储格式。
- 不模拟 token、permission、approval 或 kernel materialization。

这些问题由 `process-anchor-spike.py` 和后续真实测试处理；探针名称保留 process-anchor，因为它测量的是进程祖先锚点。

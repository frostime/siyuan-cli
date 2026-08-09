# workspaceDir 运行时核验与 SiYuan 3.7.3 的兼容发现

- **记录日期**：2026-08-09
- **发现环境**：SiYuan `3.7.3`，dev workspace `H:\Project_Active\SiYuanDevSpace`
- **状态**：已修复（N2 后续独立修复）
- **影响范围**：配置使用 `workspaceDir`、需要经 `materializeWorkspace()` 自动解析 `baseUrl` 的调用

## 结论

旧版 workspace resolver 依赖 `/api/system/getConf` 返回非空的
`data.conf.system.workspaceDir`，再用它核验端口是否属于目标 workspace。
在本次 dev 环境的 SiYuan 3.7.3 中，响应结构仍包含该字段，但字段值为空字符串。
因此 resolver 把实际可用的 dev kernel 误判为 workspace 不匹配，并抛出
`WORKSPACE_VERIFY_FAILED`。

该问题已通过后续独立修复解决：resolver 现在直接读取目标 workspace 的
`conf/conf.json` 获取 localhost 端口，再调用该端口的
`/api/system/getWorkspaceInfo` 验证运行时 workspace 路径；不再依赖
`getWorkspaces` 或 `getConf`。验证请求携带 workspace token，并保留路径不匹配时的安全拒绝。

这不是 N2 的 `history.createDocHistory` 或 `checkpoint-doc` 故障。修复后使用
`workspaceDir` 自动解析的 dev 配置运行 `pnpm run siyuan workspace verify dev`
已成功返回 `http://127.0.0.1:1181`。

## 复现证据

### 1. 现有 CLI 核验失败

```bash
pnpm run siyuan workspace verify dev
```

结果：

```text
WORKSPACE_VERIFY_FAILED
Port 1181 does not match workspace "H:\Project_Active\SiYuanDevSpace" at runtime.
```

该次失败后还出现过 Node/libuv 的 `UV_HANDLE_CLOSING` assertion；目前没有证据表明
它与 workspace 误判属于同一根因，应在后续调查中单独确认。

### 2. workspace 与端口的其他证据正常

- `/api/system/getWorkspaces` 返回：
  - path：`H:\Project_Active\SiYuanDevSpace`
  - closed：`false`
- dev workspace 的 `conf/conf.json` 中 `serverAddrs` 包含：
  - `http://127.0.0.1:1181`
- `http://127.0.0.1:1181/api/system/version` 返回 SiYuan `3.7.3`。
- 使用同一 dev 凭据直接连接该 base URL，可正常执行注册 API 与 tool。

### 3. 导致误判的字段

`POST http://127.0.0.1:1181/api/system/getConf` 返回的数据仍有：

```text
data.conf.system.workspaceDir = ""
```

当前 `/src/workspace/resolver.ts → verifyPortMatchesWorkspace()` 的逻辑是：

1. 读取 `data.conf.system.workspaceDir`；
2. 字段为空时直接返回 `false`；
3. `resolveWorkspaceDirToBaseUrl()` 据此抛出 `WORKSPACE_VERIFY_FAILED`。

因此当前证据支持“字段不再提供有效值”，不能仅凭本次观察断言整个 API
响应结构已经改变。

## 对用户的实际影响

- 使用 `workspaceDir` 配置的 workspace 可能无法被 materialize，即使对应 kernel
  正在运行且端口正确。
- 直接配置 `baseUrl` 的 workspace 不经过该路径核验，不受这个问题影响。
- `workspace which` 只展示解析来源，不完成运行时 materialize，因此可能显示 dev
  已选中，而后续数据面命令仍在 materialize 阶段失败。

## N2 实测采用的临时绕行

为避免访问主空间，本次只对 dev workspace 使用以下临时方法：

1. 从 dev workspace 的既有配置生成临时配置；
2. 把 workspace 连接改为已确认的 `http://127.0.0.1:1181`；
3. 不输出 token；实测结束后删除含 token 的临时配置；
4. 创建临时测试文档，执行 `checkpoint-doc`，确认 kernel history 与本地恢复包均创建；
5. 删除临时测试文档并确认 live blocks 表中已无该文档。

该绕行只用于验证 N2，不是建议的长期用户配置。

## 修复结果

- resolver 改为 `conf.json` 取端口、`getWorkspaceInfo` 做运行时身份核验。
- 核验请求携带 workspace token；端口对应其他 workspace 时仍拒绝连接。
- 新增 resolver 合约测试，覆盖正确 workspace 和不匹配 workspace。
- 重新构建后，`pnpm run siyuan workspace verify dev` 成功返回 dev kernel 的 base URL。
- 原先伴随出现的 `UV_HANDLE_CLOSING` assertion 在本次成功路径未复现；它仍未被证明与 resolver 原因相关，因此不单独处理。

## 相关代码

- `/src/workspace/resolver.ts → verifyPortMatchesWorkspace()`
- `/src/workspace/resolver.ts → resolveWorkspaceDirToBaseUrl()`
- `/src/workspace/config.ts → materializeWorkspace()`
- `/src/workspace/command.ts → workspace verify`

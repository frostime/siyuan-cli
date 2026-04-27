---
change: "workspace-dir-port-resolution"
created: 2026-04-27T21:41:37
---

# Design: workspace-dir-port-resolution

## Interface Contract

### WorkspaceEntry (更新)

```typescript
export interface WorkspaceEntry {
    baseUrl?: string;      // 通用（本地/远程），与 workspaceDir 至少提供一个
    workspaceDir?: string; // 仅本地；若提供且无 baseUrl，触发自动端口解析
    token?: string;
    tokenSource?: TokenSource;
    permission?: PermissionConfig;
    behavior?: BehaviorConfig;
}
```

**校验**：
- `baseUrl` 与 `workspaceDir` 不可同时缺失
- 同时提供时 `baseUrl` 优先（不触发解析）
- `workspaceDir` 只能指向本地路径，解析出的 `baseUrl` 一定是 `http://127.0.0.1:<port>`

### 端口解析引擎

```typescript
// src/workspace/resolver.ts
export interface ResolvedPort {
    baseUrl: string;       // "http://127.0.0.1:12713"
    port: number;
    workspaceDir: string;  // 绝对路径（normalized）
    verified: boolean;
}

export async function resolveWorkspaceDirToBaseUrl(
    workspaceDir: string,
    opts?: { seedPort?: number; timeoutMs?: number; skipCache?: boolean }
): Promise<ResolvedPort>;

export function clearWorkspaceDirCache(): void;
```

## Behavioral Spec: Resolution Flow

```
resolveWorkspaceDirToBaseUrl(workspaceDir)
│
├─ 1. cache hit → POST <cached.port>/api/system/getConf
│                → verify workspaceDir matches → return cached
│                → mismatch → cache.delete() → continue to step 2
│
├─ 2. POST http://127.0.0.1:<seedPort>/api/system/getWorkspaces
│   └─ fail → CliError(NETWORK, SIYUAN_NOT_RUNNING)
│
├─ 3. match ws.path against workspaceDir (fuzzy: basename or full path)
│   └─ no match → CliError(CONFIG, WORKSPACE_NOT_FOUND_IN_KERNEL)
│
├─ 4. read <ws.path>/conf/conf.json → serverAddrs → parse localhost port
│   └─ no localhost addr → CliError(CONFIG, PORT_NOT_FOUND)
│
├─ 5. POST http://127.0.0.1:<port>/api/system/getConf
│   └─ verify conf.system.workspaceDir === ws.path
│      ├─ match → cache & return ResolvedPort
│      └─ mismatch → CliError(CONFIG, WORKSPACE_VERIFY_FAILED)
```

## Data Architecture: 配置格式

`baseUrl` 和 `workspaceDir` **并列**，二选一：

```yaml
# ~/.config/siyuan-cli/config.yaml
workspaces:
  myspace:
    # 方式 A：直接指定 URL（本地/远程通用）
    baseUrl: "http://127.0.0.1:6806"
    token: "xxx"

  devspace:
    # 方式 B：按目录自动发现端口（仅本地）
    workspaceDir: "H:\\Project_Active\\SiYuanDevSpace"
    token: "ofqynzp8kmkkko4h"

  remote:
    # 远程只能用 baseUrl，workspaceDir 不适用
    baseUrl: "http://192.168.1.100:6806"
    token: "yyy"
```

## Structural Blueprint

```
src/workspace/
├── resolver.ts        ← 新增：解析引擎（无 citty 依赖）
├── config.ts          ← WorkspaceEntry.workspaceDir + resolveWorkspace/resolveEffectiveWorkspace → async
├── command.ts         ← add --workspace-dir；3 处 await 化
├── diagnostics.ts     ← 不变

src/api/
├── command.ts         ← resolveEffectiveWorkspace 加 await（1 行）

src/tool/
├── registry.ts        ← resolveEffectiveWorkspace 加 await（1 行）
```

### async 影响分析

`resolveWorkspace` / `resolveEffectiveWorkspace` 从同步变 async。所有调用方已在 async 函数体中，改动是机械的加 `await`。

| 调用点 | 文件 | 改动 |
|--------|------|------|
| `resolveEffectiveWorkspace` → `callEndpoint` | `src/api/command.ts` | 加 `await` |
| `resolveEffectiveWorkspace` → `createToolContext` | `src/tool/registry.ts` | 加 `await` |
| `resolveWorkspace` / `resolveEffectiveWorkspace` ×4 | `src/workspace/command.ts` | 3 处加 `await`（which 已 async）|
| `resolveEffectiveWorkspace` 内部 | `src/workspace/config.ts` | 自身 + `resolveWorkspace` 调用加 `await` |

## Outcome Preview

```bash
# 添加 workspace（目录方式）
$ siyuan workspace add devspace --workspace-dir "H:\Project_Active\SiYuanDevSpace" --token ofqynzp8kmkkko4h
{"added":"devspace","baseUrl":"http://127.0.0.1:12713","workspaceDir":"H:\\Project_Active\\SiYuanDevSpace"}

# 使用时透明
$ siyuan workspace which --workspace devspace
{"workspace":"devspace","baseUrl":"http://127.0.0.1:12713","source":"flag"}

# 如果进程未运行
$ siyuan api system.version --workspace devspace
{"error":"SIYUAN_NOT_RUNNING","message":"Cannot reach SiYuan on seed port 6806..."}
```

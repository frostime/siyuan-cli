# P1 Design

> 只记录 implementation-level 的接口契约和数据格式——这些是 spec.md 无法覆盖、但实现时必须对齐的细节。
> 架构分层、目录结构、技术选型见 `reference/siyuan-cli-design/02-architecture.md`。
> Workspace 模块完整设计见 `reference/siyuan-cli-design/03-module-workspace.md`。

## 1. Config File Format

```yaml
# ~/.config/siyuan-cli/config.yaml
schemaVersion: 1

current: main               # 当前活跃 workspace name

workspaces:
  main:
    baseUrl: http://127.0.0.1:6806
    token: your-token-here  # optional
  remote:
    baseUrl: http://192.168.1.10:6806
    token: ~

api:
  disabled: []              # glob list, e.g. ["export.*", "convert.*"]
```

**注意**：`workspaces` 用 map（name 为 key），不用数组——保证 name 唯一且查找 O(1)。

## 2. SiyuanClient Interface

```ts
interface ClientConfig {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;        // default: 10_000
}

interface PingResult {
  ok: boolean;
  version?: string;          // kernel version string, e.g. "3.1.18"
  message?: string;          // error description if !ok
}

class SiyuanClient {
  constructor(config: ClientConfig);

  // JSON API: POST /api/<endpoint>, returns response.data
  call(endpoint: string, payload: unknown): Promise<unknown>;

  // multipart upload: POST /api/<endpoint>
  upload(endpoint: string, files: Array<{ field: string; path: string }>, fields?: Record<string, string>): Promise<unknown>;

  // GET /api/system/version — lightweight connectivity check
  ping(): Promise<PingResult>;
}
```

## 3. Config Module Interface

```ts
interface WorkspaceEntry {
  baseUrl: string;
  token?: string;
}

interface AppConfig {
  schemaVersion: number;
  current: string;
  workspaces: Record<string, WorkspaceEntry>;
  api?: { disabled?: string[] };
}

// 读取（不存在则返回 default config，不抛错）
function loadConfig(configPath?: string): AppConfig;

// 写回磁盘（atomic write: tmp → rename）
function saveConfig(config: AppConfig, configPath?: string): void;

// 解析当前 workspace（考虑 flag > env > current）
function resolveWorkspace(
  config: AppConfig,
  overrides: { workspace?: string; baseUrl?: string; token?: string }
): WorkspaceEntry & { name: string };
```

## 4. Error Model

所有错误输出到 **stderr**，格式为结构化 JSON：

```json
{ "error": "ECONNREFUSED", "message": "Cannot connect to http://127.0.0.1:6806", "hint": "Is SiYuan running?" }
```

Exit codes：

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Config error (missing workspace, invalid config) |
| 3 | Network error (connection refused, timeout) |
| 4 | Auth error (401 / token rejected) |
| 5 | Permission denied (by permission engine) |

## 5. Workspace Command Output (JSON)

`siyuan workspace list` stdout：

```json
{
  "current": "main",
  "workspaces": [
    { "name": "main", "baseUrl": "http://127.0.0.1:6806", "hasToken": true },
    { "name": "remote", "baseUrl": "http://192.168.1.10:6806", "hasToken": false }
  ]
}
```

**注意**：`hasToken: boolean` 而不是暴露 token 值（除非 `--reveal-token`）。

`siyuan workspace verify <name>` stdout（成功）：

```json
{ "ok": true, "workspace": "main", "version": "3.1.18", "baseUrl": "http://127.0.0.1:6806" }
```

# 03 · Workspace 模块

> 本篇要回答什么：配置文件长什么样？Token 怎么存？优先级规则？每条子命令做什么？

## 1. 配置文件

路径：`~/.config/siyuan-cli/config.yaml`（Windows: `%APPDATA%\siyuan-cli\config.yaml`）

### 1.1 完整 Schema

```yaml
# 必须放在文件头，用于未来迁移
schemaVersion: 1

# 当前活跃 workspace（可被 --workspace 或 $SIYUAN_CLI_WORKSPACE 覆盖）
current: personal

# workspace 列表（map 结构：name 即 key，不允许重复）
workspaces:
  personal:
    baseUrl: http://127.0.0.1:6806
    token: "abcdef0123456789"       # 可省略（未配置 accessAuthCode 的本地实例）
    description: "本地主 workspace"
    # 每个 workspace 可以有自己的权限配置（覆盖 defaults）
    permission:
      api:
        # glob 模式，命中 disabled 则禁用
        # 注意：用派生 id，形如 <group>.<n>，点号分隔
        disabled:
          - system.exit
          - system.setUILayout
          - file.removeFile
          - "export.*"
          - "convert.*"
        # 若同时配置 enabled，则只允许白名单（优先级：enabled > disabled）
        # enabled: ["query.*", "block.*", "filetree.*"]

      content:
        # 禁止读写的 notebook（按 notebook ID）
        notebooks:
          deny: ["20210817205410-2kvfpfn"]
          # allow: [...]           # 配置则为白名单

        # 禁止读写的 document path（按思源 path；基于 ID，稳定）
        # 形如 /<notebookId>/<docId>.sy ；支持 glob
        paths:
          deny:
            - "/20260416161053-e4pj7ri/20260417090223-*.sy"   # 特定文档
            - "/20260416161053-e4pj7ri/20260410*/**"          # 某子树
            - "/20211001123456-abcdefg/**"                    # 整个 notebook 的所有文档
          # allow: [...]

      # 写保护：即便 api 和 content 都允许，下面的写操作也会要求 --yes 或 --dry-run
      guardWrite: true

  work:
    baseUrl: http://work-server.internal:6806
    token: "..."
    description: "工作用的远端实例"

  docker:
    baseUrl: http://127.0.0.1:6808
    description: "Docker 跑的测试环境"
    # 无 token 字段

# 全局默认（被 workspace.permission 覆盖）
defaults:
  permission:
    api:
      disabled:
        - system.exit

# CLI 自身偏好
cli:
  format: json                      # json | pretty | yaml
  timeoutMs: 30000
  userAgent: "siyuan-cli/0.1"
```

### 1.2 TypeScript 类型

```ts
export interface CliConfig {
  schemaVersion: 1;
  current?: string;
  workspaces: Record<string, WorkspaceConfig>;
  defaults?: { permission?: PermissionConfig };
  cli?: { format?: OutputFormat; timeoutMs?: number; userAgent?: string };
}

export interface WorkspaceConfig {
  baseUrl: string;
  token?: string;
  tokenSource?: TokenSource;          // 见 §2.2
  description?: string;
  permission?: PermissionConfig;
}

export interface TokenSource {
  type: "env" | "file" | "command";
  value: string;
}

export interface PermissionConfig {
  api?: { disabled?: string[]; enabled?: string[] };
  content?: {
    notebooks?: { deny?: string[]; allow?: string[] };
    paths?: { deny?: string[]; allow?: string[] };       // 思源 path（不是 hpath）
  };
  guardWrite?: boolean;
}
```

### 1.3 默认值

首次运行时如果配置文件不存在，生成：

```yaml
schemaVersion: 1
workspaces: {}
defaults:
  permission:
    api:
      disabled:
        - system.exit
        - system.setUILayout
cli:
  format: json
```

## 2. Path 语义（**v2 关键变更**）

### 2.1 为什么不用 hpath

- **hpath 不唯一**：思源允许同名文档，`/笔记/日记` 可能对应多个 id
- **hpath 不稳定**：重命名文档后，原来的 deny 规则失效，这对安全兜底反而是反模式

### 2.2 path 的形态

思源 path 是 notebook 内部 `.sy` 文件的实际路径，基于 ID：

```
/20260416161053-e4pj7ri/20260417090223-xxxxxxx.sy
└─ notebook 根 ─┘ └──── 文档 ID ────┘
```

- 唯一、稳定、跨版本可靠
- 子文档在同级，用"文档 ID 作为文件夹 + `.sy` 同名文件"的方式嵌套

```
/<notebookId>/20260410abc.sy                     ← 父文档
/<notebookId>/20260410abc/                       ← 子文档目录
/<notebookId>/20260410abc/20260411def.sy         ← 子文档
```

### 2.3 配置写法

支持 micromatch 全套 glob：

| 规则 | 含义 |
| --- | --- |
| `/20210817205410-2kvfpfn/**` | 整个 notebook 下所有文档 |
| `/20260416.../20260417abc.sy` | 单个文档（不含子文档） |
| `/20260416.../20260417abc/**` | 该文档的所有子孙 |
| `/20260416.../20260417abc*` | 同上两条的联合（`abc` 开头的 `.sy` 与同名目录下的 `**`） |

**建议**：把"禁一棵子树"写成两条规则更清晰：

```yaml
paths:
  deny:
    - "/20260416.../20260417abc.sy"
    - "/20260416.../20260417abc/**"
```

### 2.4 配套 Tool：`resolve-path`

path 对人类不友好，用户很难手写。提供一个解析助手：

```bash
siyuan tool resolve-path --hpath "/私人/日记"

# content:
# 找到 1 个匹配：
# - /20260416161053-e4pj7ri/20260417090223-xxxxxxx.sy （hpath=/私人/日记）

# details:
# {
#   "matches": [
#     {
#       "id": "20260417090223-xxxxxxx",
#       "notebook": "20260416161053-e4pj7ri",
#       "path": "/20260416161053-e4pj7ri/20260417090223-xxxxxxx.sy",
#       "hpath": "/私人/日记"
#     }
#   ]
# }
```

内部实现：`SELECT id, box, path, hpath FROM blocks WHERE type='d' AND hpath=?`。

用户可以把 details 里的 path 粘到 config.yaml 的 deny 里。

## 3. Token 存储策略

### 3.1 选项对比

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 明文 yaml + chmod 0600 | 简单，Agent 友好（一个文件全搞定） | 可读性等于风险 |
| OS keychain（`keytar`） | OS 级保护 | 增加 native 依赖；Docker / headless 不可用 |
| 外部 secret file（`tokenSource.type=file`） | 灵活 | 用户心智负担 |
| 环境变量（`$SIYUAN_CLI_TOKEN_<NAME>`） | 零落盘 | Agent 每次调用要注入 |

### 3.2 推荐方案：混合

**默认**：明文 + chmod 0600（Unix），保证"Agent 友好"。

**进阶**：支持 `tokenSource` 字段：

```yaml
workspaces:
  personal:
    baseUrl: http://127.0.0.1:6806
    tokenSource:
      type: env                      # env | file | command
      value: SIYUAN_TOKEN_PERSONAL
```

支持的 `type`：

- `env`：读环境变量
- `file`：读指定文件第一行
- `command`：执行命令，stdout trim 作为 token（对接 `pass`、`op read`、`gopass`）

解析优先级（从高到低）：

1. CLI flag `--token`
2. 环境变量 `SIYUAN_CLI_TOKEN`（作用于当前活跃 workspace）
3. `tokenSource`（如果配置）
4. `token`（明文字段）
5. 无 token（对应 `accessAuthCode` 未启用的实例）

## 4. 命令清单

### 4.1 `siyuan workspace add <n>`

```
siyuan workspace add <n> \
    [--url <baseUrl>] \
    [--token <token>] \
    [--token-env <ENV_VAR>] \
    [--token-file <path>] \
    [--token-command '<cmd>'] \
    [--description <text>] \
    [--set-current] \
    [--skip-verify]
```

**行为**：

- `<n>` 必填，唯一；重复则报错（`--force` 覆盖）
- `--url` 省略则 `http://127.0.0.1:6806`
- token 系列 flag 互斥，最多一个
- 自动执行一次 `verify`（除非 `--skip-verify`）；失败时不写配置
- 若无其他 workspace 或设置了 `--set-current`，将其置为 current
- 输出：添加的 workspace 的 JSON（敏感字段替换为 `"[hidden]"`）

### 4.2 `siyuan workspace list`

```
siyuan workspace list [--format json|pretty|table]
```

输出 workspace 数组，每项包含 `name, baseUrl, description, tokenConfigured, isCurrent, lastVerified`。

**默认不输出 token 本身**，用 `siyuan workspace show <n> --reveal-token` 显式查看。

### 4.3 `siyuan workspace use <n>`

切换 current。写入 `current: <n>` 到配置。

### 4.4 `siyuan workspace verify [<n>]`

```
siyuan workspace verify                # 验证当前 current
siyuan workspace verify personal       # 验证指定的
siyuan workspace verify --all          # 全部验证
```

**实现**：调用 `/api/system/version`（无参数、幂等），返回 `{ok: true, version: "3.6.4", elapsedMs: 47}`。

### 4.5 `siyuan workspace show [<n>]`

```
siyuan workspace show                  # 当前
siyuan workspace show personal --reveal-token
```

### 4.6 `siyuan workspace remove <n>`

删除指定 workspace。若是 current，清空 current（提示用户设置新的）。

## 5. Workspace 解析逻辑（每次命令执行时）

```ts
function resolveWorkspace(args: GlobalArgs, config: CliConfig, env: NodeJS.ProcessEnv): ResolvedWorkspace {
  // 1. name: CLI flag > env > config.current
  const name = args.workspace ?? env.SIYUAN_CLI_WORKSPACE ?? config.current;
  if (!name) throw new NoCurrentWorkspaceError();
  const ws = config.workspaces[name];
  if (!ws) throw new WorkspaceNotFoundError(name);

  // 2. baseUrl: CLI flag > workspace.baseUrl
  const baseUrl = args.baseUrl ?? ws.baseUrl;

  // 3. token: CLI flag > env > tokenSource > token
  const token =
    args.token ??
    env.SIYUAN_CLI_TOKEN ??
    resolveTokenSource(ws) ??
    ws.token;

  return { name, baseUrl, token, permission: mergePermission(config.defaults?.permission, ws.permission) };
}
```

## 6. 错误场景

| 场景 | 行为 |
| --- | --- |
| config.yaml 不存在 | 自动创建空文件并提示"先 `siyuan workspace add`" |
| `current` 指向不存在的 workspace | 报错，建议 `workspace list/use` |
| `verify` 超时（默认 5s） | 分类型报错：`ECONNREFUSED` / `ETIMEOUT` / `401` / `其他 HTTP` |
| `tokenSource.command` 执行失败 | 报错并指出退出码；不回退到 `token` 字段（避免权限混淆） |

## 7. JSON Schema（用于 IDE 补全）

将 `src/core/config.ts` 类型 + JSON Schema 维护在一起，发布到 `schemas/config.schema.json`，在 config.yaml 头部加：

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/<scope>/siyuan-cli/main/schemas/config.schema.json
```

这样 VS Code + YAML 插件能自动校验。

## 8. 实现优先级

**MVP（week 1）**：

- [x] 读写 config.yaml
- [x] `add / list / use / verify / remove / show`
- [x] `--workspace` / `$SIYUAN_CLI_WORKSPACE` 覆盖

**V0.2**：

- [ ] `tokenSource`（env/file/command）
- [ ] chmod 0600 自动设置
- [ ] `verify --all`
- [ ] `resolve-path` Tool

**V0.3+**：

- [ ] Token 迁移助手（从明文搬到 keychain）
- [ ] `workspace export/import` 便携化

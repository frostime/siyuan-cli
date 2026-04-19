---
name: workspace-session-isolation
from-request: .sspec/requests/26-04-17T20-24_workspace-session-isolation.md
created: 2026-04-19
status: READY_TO_APPLY
format: sspec-patch-multi-block
tldr: "分两阶段落地 workspace session isolation：Phase 1 引入 ResolvedWorkspace.source + 加载期校验 + IMPLICIT_WORKSPACE 警告；Phase 2 引入 .siyuan-cli.yaml 项目配置文件。文档同步更新。"
note: 当前文档中的 patch 可以直接运行 CLI `sspec tool patch --yes -f <thisfile>` 批量应用无需手动 edit，建议首先运行 `--dry-run` 确认
---

# 对 `workspace-session-isolation` 请求的深入分析

## 总体判断

**方向完全正确，整体设计扎实，属于"准备好进入 Phase 1-2 的设计"**。

这不是那种需要大量返工的提议。问题识别准确，选择的方向（项目级配置文件）是业界标准模式，内部一致性好。下面是逐项核验和我的修正建议。

------

## 一、问题诊断是否成立

### P1：`config.current` 是全局共享可变状态 — **真实且关键**

**结论**：P1 必须解决。project-file 是正确解法。

### P2：同 workspace 不同项目不同权限 — **真实但是 P1 的自然副产物**

请求文档的定位对："clunky but workable"。当前确实只能通过复制 workspace 解决。但一旦 P1 的 `.siyuan-cli.yaml` 落地，P2 自动获得表达空间，无需独立设计。

**结论**：不应作为独立设计目标，合并进 P1 的实现中。请求文档的处理正确。

### P3：load-time smoke test + implicit workspace warning — **适合作为 Phase 1 独立出货**

这部分是**完全正交**的改进：

- 不需要 `.siyuan-cli.yaml` 就能做
- `ResolvedWorkspace.source` 的穿线是 Phase 2 的前置依赖
- 加载期 hpath-like 校验与 `registry.ts::validateSchema` 的哲学一致（fail-fast，小成本高价值）

**结论**：Phase 1 拆分合理。

------

## 二、核心设计决策的评价

### 2.1 文件名与位置：`.siyuan-cli.yaml` + 向上走查

**完全同意。** 这是标准模式（`.eslintrc`、`pyproject.toml`、`.nvmrc`），agent 认知成本为零。

小细节：

- 明确不读 `$HOME/.siyuan-cli.yaml` — 正确，避免与全局 XDG 配置语义冲突
- 到文件系统根停止 — 建议加一个 `MAX_DEPTH = 32` 的防御性上限，避免某些奇怪的 mount 或 symlink 循环

### 2.2 解析链优先级

```
--workspace flag > $SIYUAN_CLI_WORKSPACE > .siyuan-cli.yaml > config.current
```

**同意，但建议明文写清楚一个歧义点**：

> 当 `--workspace=B` 覆盖了 `.siyuan-cli.yaml` 中的 `workspace: A`，项目文件的 **permission 块是否仍然生效？**

请求文档里说"项目 permission 完全替换"，但没明确这个场景。我的建议：

**项目 permission 始终生效（只要项目文件存在）**，即使 workspace 被 flag 覆盖。

理由：

- 语义更直观：`.siyuan-cli.yaml` 描述的是"在这个目录下操作应受何约束"，与具体指向哪个 workspace 正交
- 符合安全最小化原则：项目的 deny 规则不应该因为换 workspace 被 bypass
- 对 agent 更友好：agent 可以临时 `--workspace=<其他>`，项目保护仍在

需要在文档里举一个具体例子说明。

### 2.3 拒绝 `token` / `baseUrl` / `tokenSource`

**强烈赞同**。这是这份设计的亮点之一。

收益：

- 项目文件**构造性安全**，可以放心提交到 git
- 防止新手 commit 凭证
- 语义清洁：连接信息属于机器/用户，配置属于项目

建议补一条：**`defaults` 字段也应该拒绝**。项目文件不应该能定义 "defaults for everyone"，那是全局配置的职责。

### 2.4 Permission 策略：两层替换 vs 三层合并

请求文档选择**完整替换**（不合并 workspace-level 或 defaults）。

**我倾向于同意，但理由要比文档里写得更清晰**：

请求给的理由是"debug 友好 — 规则不触发时只有两个候选源"。这个理由 OK 但不够强。更强的理由是：

> 项目文件表达的是"**这个目录下的操作必须满足这些约束**"，这是一个完整的断言，不是对现有约束的增量调整。如果合并，则某个目录的 permission 会被全局 defaults 里不相关的规则"污染"，项目的意图反而不明确。

这与 `workspaces[name].permission ?? defaults.permission` 的现有替换语义保持一致。**维持设计一致性本身就是强理由**。

**但需要预留一个逃生通道**：如果用户报告大量重复，在 Phase 3 考虑显式 `extends:` 字段，而不是隐式合并。例如：

```yaml
# 未来 v2 可能支持
workspace: prod
permission:
  extends: "workspace"        # 或 "defaults" 或 "none"（默认）
  content:
    paths:
      deny: ["/private/**"]   # 增量叠加
```

但**现在不做**，等真实痛点出现。这是好设计。

### 2.5 `ResolvedWorkspace.source`

**同意，而且这是整个方案的观测性基础**。

但建议 `source` 枚举的命名再精细一点：

```ts
source:
  | "flag"               // --workspace
  | "env"                // $SIYUAN_CLI_WORKSPACE
  | "project-file"       // .siyuan-cli.yaml 里的 workspace 字段
  | "global-current"     // config.yaml 的 current
  | "ad-hoc"             // --baseUrl 走 overrides 分支（现有代码已有这个分支）
```

当前的 `resolveWorkspace` 有 `<ad-hoc>` 分支（`overrides.baseUrl`），不处理会漏一种情况。

### 2.6 加载期验证（五条）

**全部同意，与 `registry.ts::validateSchema` 哲学一致**。

补充建议：

- **解析错误本身应是硬错误**（请求文档没明说）。如果 `.siyuan-cli.yaml` 存在但 YAML 解析失败，不应该静默回退到 `config.current`，应该报 `PROJECT_CONFIG_PARSE_ERROR`。
- **`permission.tools` 字段也适用于检查**（当前设计覆盖了 endpoints/notebooks/paths 但没提 tools）。tool id 是 kebab-case，不会误写成 hpath，但可以校验 tool id 是否存在于 registry，以 soft warning 形式提示 `UNKNOWN_TOOL_ID`。

------

## 三、需要澄清或改进的点

### 3.1 项目文件应有 `schemaVersion`

请求没提。但 `AppConfig` 有 `schemaVersion: 2` 并且会在不匹配时硬错。项目文件应保持相同原则：

```yaml
schemaVersion: 1
workspace: prod
permission:
  ...
```

成本低、为未来迁移（比如引入 `extends:`）留通道。建议加入第一版。

### 3.2 缺少一个 `siyuan workspace which` 命令

对 agent 来说这非常有用。想象这个场景：

```
Agent: 我要在这里写入 prod 前先确认
$ siyuan workspace which
{
  "workspace": "prod",
  "source": "project-file",
  "projectConfigPath": "/home/user/proj/.siyuan-cli.yaml",
  "effectivePermission": { ...resolved... },
  "wouldWarnOnWrite": false
}
```

这是**成本极低、价值极高**的调试工具。建议 Phase 2 一起做。

请求文档在"What is NOT added"里排除了 `siyuan workspace use --local`，这合理（鼓励手写 YAML）。但 `which` 是只读观测命令，不存在"create-or-update 歧义"。

### 3.3 `IMPLICIT_WORKSPACE` 警告的触发条件需要更精确

请求文档说：

> `IMPLICIT_WORKSPACE` 警告 fires iff `source === "global-current"` AND `classification.mode !== "read"`

这里有个边界：`invoke` 模式（notification、system.exit 等）算不算？

按字面是的（`mode !== "read"` 包含 `invoke`）。但 `invoke/runtime` 里的 `notification.pushMsg`（被 `riskOverride: "safe"`）大概不应该警告。

**建议精化规则**：

```ts
shouldWarnImplicitWorkspace(entry) =
  source === "global-current"
  && (entry.meta.risk === "elevated"
      || entry.meta.risk === "destructive"
      || entry.meta.risk === "critical")
```

换成 **risk-level 判定**，而非 mode 判定。这样：

- read+content（sensitive）：不警告（读操作默认不警告是对的）
- write+content+single（elevated）：警告 ✓
- write+content+batch（destructive）：警告 ✓
- invoke+runtime+notification（override: safe）：不警告 ✓
- invoke+runtime+exit（override: critical）：警告 ✓

这与 `requiresConfirmation` 的推导逻辑（destructive/critical auto-confirm）一致。

### 3.4 多个 cwd 场景的明确说明

文档应该用具体例子说明：

```
monorepo/
  .siyuan-cli.yaml       # workspace: prod
  subproject-a/
    .siyuan-cli.yaml     # workspace: dev
  subproject-b/
    (无 .siyuan-cli.yaml)
```

三个目录分别跑 `siyuan api ...` 的行为：

- `monorepo/` → prod
- `monorepo/subproject-a/` → dev（不合并，完全替换）
- `monorepo/subproject-b/` → 向上走查命中 `monorepo/.siyuan-cli.yaml` → prod

这是标准行为，但写出来可以防止"我以为会合并"类的误解。

### 3.5 gitignore 策略的文档化

请求文档说"by construction safe to commit"并提到 `.siyuan-cli.yaml.example`。建议文档里明确**两种模式**：

1. **共享模式**：`.siyuan-cli.yaml` 提交，所有协作者共享 workspace 选择（适合项目有唯一"正确"的 workspace）
2. **个人模式**：`.siyuan-cli.yaml` 放 `.gitignore`，提交 `.siyuan-cli.yaml.example`（适合每个开发者 workspace 名字不同）

别让用户自己去想。

### 3.6 错误码/警告码补充到 `90-errors-and-exit-codes.md`

新引入的需要进入分类表：

硬错误（CONFIG，exit 2）：

- `PROJECT_CONFIG_PARSE_ERROR`
- `PROJECT_CONFIG_REJECTED_FIELD`
- `PROJECT_CONFIG_WORKSPACE_NOT_FOUND`
- `PROJECT_CONFIG_VERSION_UNSUPPORTED`

警告（stderr，不影响 exit code）：

- `IMPLICIT_WORKSPACE`
- `LIKELY_HPATH_NOT_ID`
- `UNKNOWN_PROJECT_CONFIG_KEY`

现在的错误分类表写得很整齐，别破坏它。

------

## 四、代码侧实现建议

略过

------

## 五、对 Phasing 的细化建议

请求文档给出三阶段划分合理。我建议每个阶段的 **DoD (Definition of Done)** 更具体：

### Phase 1（独立出货，~2-3 天工作量）

DoD：

-  `ResolvedWorkspace.source` 类型定义完成，`resolveWorkspace` 返回 source
-  `executeEndpoint` 在 `source === "global-current"` + risk 属于 elevated/destructive/critical 时输出 `IMPLICIT_WORKSPACE` 警告
-  `loadConfig` 加载时对每个 workspace 的 `permission.content.notebooks.{allow,deny}` 值做 id pattern 检查，不匹配时输出 `LIKELY_HPATH_NOT_ID` 警告
-  对 `permission.content.paths.{allow,deny}` 做"无 id 段"检查（至少有一个 14 位数字-7 位字母段），否则 `LIKELY_HPATH_NOT_ID_IN_PATH` 警告
-  文档：更新 `30-config.md` 加入"load-time 校验"小节

### Phase 2（核心特性，~5-7 天工作量）

DoD：

-  `findProjectConfig` 实现 + 单元测试
-  `ProjectConfig` 类型 + `loadProjectConfig` 函数（包含全部 5 条加载期校验）
-  `resolveWorkspace` 接入项目文件，返回 `source` + `projectConfigPath` + `effectivePermission`
-  `PermissionEngine` 支持项目 permission 替换
-  `api.ts`、`tools.ts` 切换到 `buildEffectiveContext`
-  `siyuan workspace which` 命令
-  `.siyuan-cli.yaml.example` 模板
-  文档：新增 `31-workspace-resolution.md`，修订 `30-config.md`
-  集成测试：两个 cwd 并发调用不同 workspace，验证不串

### Phase 3（观察期）

明确**触发条件**：累计 2-3 个独立用户报告重复规则的痛点，才引入 `extends:` 或别名机制。否则保持现状。


# Implement: workspace-session-isolation

## 概览

本 patch 把 `.sspec/requests/26-04-17T20-24_workspace-session-isolation.md` 里声明的 Phase 1 + Phase 2 一次性落地，以及对应的文档更新。**Phase 3（usage 观察后决定是否引入 `extends:` / 别名机制）不在本 patch 内**，那是数周后才能决定的事。

**一共 16 个 patch block**，按应用顺序组织：

| #  | 路径 | 类型 | 说明 |
|----|------|------|------|
| 1  | `src/core/config.ts` | SEARCH/REPLACE | 扩展类型：`WorkspaceResolutionSource` + `ResolvedWorkspace` 新字段 |
| 2  | `src/core/config.ts` | SEARCH/REPLACE | `resolveWorkspace` 返回 `source` |
| 3  | `src/core/config.ts` | SEARCH/REPLACE | `loadConfig` 加入加载期 permission 校验（`LIKELY_HPATH_NOT_ID` 警告） |
| 4  | `src/utils/project-config.ts` | CREATE | 新增：`ProjectConfig` 类型 + `findProjectConfig` + `loadProjectConfig` |
| 5  | `src/core/config.ts` | SEARCH/REPLACE | 顶部 imports 增加 `project-config` 引用 |
| 6  | `src/core/config.ts` | SEARCH/REPLACE | 新增 `resolveEffectiveWorkspace`（接入项目文件） |
| 7  | `src/core/permission.ts` | SEARCH/REPLACE ×3 | `createPermissionEngine` 支持项目 permission 覆盖 |
| 8  | `src/core/guard.ts` | SEARCH/REPLACE ×3 | `executeEndpoint` 发射 `IMPLICIT_WORKSPACE` 警告 |
| 9  | `src/core/tools.ts` | SEARCH/REPLACE ×2 | `createToolContext` 使用 `resolveEffectiveWorkspace` |
| 10 | `src/commands/api.ts` | SEARCH/REPLACE ×2 | `callEndpoint` 使用 `resolveEffectiveWorkspace` |
| 11 | `src/commands/workspace.ts` | SEARCH/REPLACE ×2 | 新增 `siyuan workspace which` 子命令 |
| 12 | `.siyuan-cli.yaml.example` | CREATE | 项目文件示例模板 |
| 13 | `src/docs/extending/31-workspace-resolution.md` | CREATE | 新文档：workspace 解析链完整说明 |
| 14 | `src/docs/extending/30-config.md` | SEARCH/REPLACE | 追加「项目配置文件」章节 |
| 15 | `src/docs/extending/90-errors-and-exit-codes.md` | SEARCH/REPLACE ×2 | 补充新错误码 |
| 16 | `src/docs/README.md` | SEARCH/REPLACE | 索引新增 `31-workspace-resolution.md` |

## 设计决策（已固化到 patch 中）

Request 文档留了 4 个开放点。我在这份实现里做出以下明确决策并写入代码和文档：

1. **`--workspace=X` 覆盖项目文件的 workspace 时，项目 `permission` 仍然生效**。
   理由：`.siyuan-cli.yaml` 表达「在这个目录下操作应受何约束」，与具体 workspace 名正交；合并安全最小化原则。

2. **`IMPLICIT_WORKSPACE` 警告按 risk-level 判定**，而非按 `mode`。
   具体触发条件：`source === "global-current"` 且 `entry.meta.risk ∈ {elevated, destructive, critical}`。
   排除 `sensitive`（读操作默认不警告），排除被 `riskOverride: "safe"` 的 `notification.pushMsg`，纳入被 `riskOverride: "critical"` 的 `system.exit`。

3. **项目文件解析错误是硬错误**（`PROJECT_CONFIG_PARSE_ERROR`，exit 2），不静默回退。

4. **项目文件自带 `schemaVersion: 1`**，硬校验。为将来可能的 `extends:` 保留迁移空间。

## 其他落地细节

- `findProjectConfig` 向上走查，到达 `$HOME` **不含**其中、或到达文件系统根、或超过 `MAX_WALK_DEPTH = 32` 时停止。不读 `~/.siyuan-cli.yaml`。
- `PermissionEngine` 构造函数从 `(config, workspaceName, client)` 改为直接接受 `(perm: PermissionConfig, client)`。调用点随之调整。这是本 patch 中唯一破坏源码级兼容性的变更，但对外 API（CLI）无任何破坏。
- `api.ts` 和 `tools.ts` 原本各自拼装 `loadConfig → resolveWorkspace → new SiyuanClient → createPermissionEngine` 的胶水，现在共享 `buildEffectiveContext` 一个入口（放在 `config.ts` 里）。
- `workspace which` 只读观测，不修改任何状态，不触网。纯本地调试工具。

## 应用方式

此文件是 SSPEC multi-block patch。按顺序应用每个 `patch` 代码块即可。手动 apply 时按 block 顺序一次一个，每个 patch 独立成功即可继续下一个。

**应用后必须执行**：

```bash
pnpm typecheck && pnpm build
node dist/cli.mjs workspace list
node dist/cli.mjs workspace which       # 新命令，验证可达
node dist/cli.mjs api list > /dev/null  # 验证 endpoint registry 完好
```

**建议的集成测试**（手动）：

```bash
mkdir -p /tmp/ws-iso-a /tmp/ws-iso-b
echo 'schemaVersion: 1' > /tmp/ws-iso-a/.siyuan-cli.yaml
echo 'workspace: <你的第一个 workspace 名>' >> /tmp/ws-iso-a/.siyuan-cli.yaml
echo 'schemaVersion: 1' > /tmp/ws-iso-b/.siyuan-cli.yaml
echo 'workspace: <你的第二个 workspace 名>' >> /tmp/ws-iso-b/.siyuan-cli.yaml
cd /tmp/ws-iso-a && node <repo>/dist/cli.mjs workspace which
cd /tmp/ws-iso-b && node <repo>/dist/cli.mjs workspace which
# 两个目录 which 输出的 workspace 和 source 应当各自独立、且 source 均为 "project-file"
```

---

## Phase 1：可观测性基础（P1 ~ P3）

### Patch 1 — 扩展 `ResolvedWorkspace` 类型

**文件**：`src/core/config.ts`

为解析结果引入 `source` 和项目文件相关字段。`WorkspaceResolutionSource` 对应 Request 里说的「让警告触发条件可声明化」。

````patch
# src/core/config.ts
<<<<<<< SEARCH
export interface WorkspaceEntry {
    baseUrl: string;
    token?: string;
    tokenSource?: TokenSource;
    permission?: PermissionConfig;
}

export interface AppConfig {
    schemaVersion: number;
    current: string;
    workspaces: Record<string, WorkspaceEntry>;
    defaults?: {
        permission?: PermissionConfig;
    };
}

export interface ResolvedWorkspace extends WorkspaceEntry {
    name: string;
    token?: string;
}
=======
export interface WorkspaceEntry {
    baseUrl: string;
    token?: string;
    tokenSource?: TokenSource;
    permission?: PermissionConfig;
}

export interface AppConfig {
    schemaVersion: number;
    current: string;
    workspaces: Record<string, WorkspaceEntry>;
    defaults?: {
        permission?: PermissionConfig;
    };
}

/**
 * How the active workspace name was determined. Threaded through to guard layer
 * so IMPLICIT_WORKSPACE warnings can fire on writes using the low-priority fallback.
 */
export type WorkspaceResolutionSource =
    | 'flag' // --workspace CLI flag
    | 'env' // $SIYUAN_CLI_WORKSPACE
    | 'project-file' // .siyuan-cli.yaml discovered by walking up from cwd
    | 'global-current' // fallback to config.current
    | 'ad-hoc'; // --baseUrl path, no workspace name involved

export interface ResolvedWorkspace extends WorkspaceEntry {
    name: string;
    token?: string;
    /** How this workspace name was chosen. */
    source: WorkspaceResolutionSource;
    /** Absolute path of the project config that contributed to this resolution, if any. */
    projectConfigPath?: string;
    /**
     * Permission declared in .siyuan-cli.yaml. When present, it *completely replaces*
     * workspaces[name].permission / defaults.permission for this invocation.
     * Independent of how `name` was resolved.
     */
    effectivePermission?: PermissionConfig;
}
>>>>>>> REPLACE
````

### Patch 2 — `resolveWorkspace` 返回 `source`

**文件**：`src/core/config.ts`

这是底层解析函数，不接触 project-file。`resolveEffectiveWorkspace`（Patch 5）会在其之上再叠加 project-file 处理。

````patch
# src/core/config.ts
<<<<<<< SEARCH
export function resolveWorkspace(
    config: AppConfig,
    overrides: WorkspaceOverrides = {}
): ResolvedWorkspace {
    if (overrides.baseUrl) {
        return {
            name: '<ad-hoc>',
            baseUrl: overrides.baseUrl,
            ...(overrides.token ? { token: overrides.token } : {})
        };
    }

    const name =
        overrides.workspace ??
        process.env['SIYUAN_CLI_WORKSPACE'] ??
        config.current;
    if (!name) {
        throw new CliError(
            ExitCode.CONFIG,
            'NO_WORKSPACE',
            'No active workspace. Run `siyuan workspace add <name> --url <url>` first.',
            'Or pass --workspace <name> to specify one explicitly.'
        );
    }

    const entry = config.workspaces[name];
    if (!entry) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_NOT_FOUND',
            `Workspace "${name}" not found in config.`,
            'Run `siyuan workspace list` to see available workspaces.'
        );
    }

    const token =
        overrides.token ??
        process.env['SIYUAN_CLI_TOKEN'] ??
        resolveTokenSource(entry.tokenSource) ??
        entry.token;
    return {
        name,
        baseUrl: entry.baseUrl,
        ...(token ? { token } : {}),
        ...(entry.tokenSource ? { tokenSource: entry.tokenSource } : {}),
        ...(entry.permission ? { permission: entry.permission } : {})
    };
}
=======
export function resolveWorkspace(
    config: AppConfig,
    overrides: WorkspaceOverrides = {}
): ResolvedWorkspace {
    if (overrides.baseUrl) {
        return {
            name: '<ad-hoc>',
            baseUrl: overrides.baseUrl,
            source: 'ad-hoc',
            ...(overrides.token ? { token: overrides.token } : {})
        };
    }

    let name: string | undefined;
    let source: WorkspaceResolutionSource;
    if (overrides.workspace) {
        name = overrides.workspace;
        source = 'flag';
    } else if (process.env['SIYUAN_CLI_WORKSPACE']) {
        name = process.env['SIYUAN_CLI_WORKSPACE'];
        source = 'env';
    } else if (config.current) {
        name = config.current;
        source = 'global-current';
    } else {
        throw new CliError(
            ExitCode.CONFIG,
            'NO_WORKSPACE',
            'No active workspace. Run `siyuan workspace add <name> --url <url>` first.',
            'Or pass --workspace <name> to specify one explicitly.'
        );
    }

    const entry = config.workspaces[name];
    if (!entry) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_NOT_FOUND',
            `Workspace "${name}" not found in config.`,
            'Run `siyuan workspace list` to see available workspaces.'
        );
    }

    const token =
        overrides.token ??
        process.env['SIYUAN_CLI_TOKEN'] ??
        resolveTokenSource(entry.tokenSource) ??
        entry.token;
    return {
        name,
        baseUrl: entry.baseUrl,
        source,
        ...(token ? { token } : {}),
        ...(entry.tokenSource ? { tokenSource: entry.tokenSource } : {}),
        ...(entry.permission ? { permission: entry.permission } : {})
    };
}
>>>>>>> REPLACE
````

### Patch 3 — 加载期 permission 规则校验

**文件**：`src/core/config.ts`

Request 文档的 Phase 1 最后一块：在 `loadConfig` 时对 `permission.content.notebooks.{allow,deny}` 和 `permission.content.paths.{allow,deny}` 的每一条做 id-shape smoke-test，不匹配则往 stderr 写 `LIKELY_HPATH_NOT_ID` / `LIKELY_HPATH_NOT_ID_IN_PATH` 警告。非致命。

这段代码复用 kernel id pattern `^\d{14}-[0-9a-z]{7}$`。

````patch
# src/core/config.ts
<<<<<<< SEARCH
export function loadConfig(configPath?: string): AppConfig {
    const path = configPath ?? getConfigPath();
    migrateLegacyWindowsConfig(path);

    if (!existsSync(path)) return defaultConfig();

    try {
        const raw = readFileSync(path, 'utf-8');
        const parsed = parse(raw) as Partial<AppConfig>;
        const schemaVersion = parsed.schemaVersion ?? 1;
        if (schemaVersion !== SCHEMA_VERSION) {
            throw new CliError(
                ExitCode.CONFIG,
                'CONFIG_VERSION_UNSUPPORTED',
                `Config schemaVersion ${schemaVersion} is unsupported. Expected ${SCHEMA_VERSION}.`,
                'Delete the old config file and recreate workspaces in alpha stage.'
            );
        }
        return {
            schemaVersion: SCHEMA_VERSION,
            current: parsed.current ?? '',
            workspaces: parsed.workspaces ?? {},
            ...(parsed.defaults ? { defaults: parsed.defaults } : {})
        };
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError(
            ExitCode.CONFIG,
            'CONFIG_PARSE_ERROR',
            `Failed to parse config at ${path}: ${e instanceof Error ? e.message : String(e)}`,
            'Delete the config file and recreate it in alpha stage.'
        );
    }
}
=======
const ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/;
const ID_SEGMENT_RE = /\d{14}-[0-9a-z]{7}/;

/** Soft warning helper — never throws, just writes to stderr. */
function warnPermissionSmoke(
    scope: string,
    permission: PermissionConfig | undefined
): void {
    if (!permission?.content) return;
    for (const access of ['read', 'write'] as const) {
        const rule = permission.content[access];
        if (!rule) continue;
        for (const bucket of ['allow', 'deny'] as const) {
            for (const nb of rule.notebooks?.[bucket] ?? []) {
                if (!ID_PATTERN.test(nb)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID',
                            scope,
                            at: `content.${access}.notebooks.${bucket}`,
                            value: nb,
                            hint: 'Notebook rules take a notebook id, not an hpath.'
                        }) + '\n'
                    );
                }
            }
            for (const pathRule of rule.paths?.[bucket] ?? []) {
                // If the rule does not contain any segment matching the id pattern,
                // it almost certainly points at an hpath and will never match.
                if (!ID_SEGMENT_RE.test(pathRule)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID_IN_PATH',
                            scope,
                            at: `content.${access}.paths.${bucket}`,
                            value: pathRule,
                            hint: 'Path rules take an id-based SiYuan path, not an hpath.'
                        }) + '\n'
                    );
                }
            }
        }
    }
}

function runConfigSmokeTest(config: AppConfig): void {
    warnPermissionSmoke('defaults', config.defaults?.permission);
    for (const [name, ws] of Object.entries(config.workspaces)) {
        warnPermissionSmoke(`workspaces.${name}`, ws.permission);
    }
}

export function loadConfig(configPath?: string): AppConfig {
    const path = configPath ?? getConfigPath();
    migrateLegacyWindowsConfig(path);

    if (!existsSync(path)) return defaultConfig();

    try {
        const raw = readFileSync(path, 'utf-8');
        const parsed = parse(raw) as Partial<AppConfig>;
        const schemaVersion = parsed.schemaVersion ?? 1;
        if (schemaVersion !== SCHEMA_VERSION) {
            throw new CliError(
                ExitCode.CONFIG,
                'CONFIG_VERSION_UNSUPPORTED',
                `Config schemaVersion ${schemaVersion} is unsupported. Expected ${SCHEMA_VERSION}.`,
                'Delete the old config file and recreate workspaces in alpha stage.'
            );
        }
        const result: AppConfig = {
            schemaVersion: SCHEMA_VERSION,
            current: parsed.current ?? '',
            workspaces: parsed.workspaces ?? {},
            ...(parsed.defaults ? { defaults: parsed.defaults } : {})
        };
        runConfigSmokeTest(result);
        return result;
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError(
            ExitCode.CONFIG,
            'CONFIG_PARSE_ERROR',
            `Failed to parse config at ${path}: ${e instanceof Error ? e.message : String(e)}`,
            'Delete the config file and recreate it in alpha stage.'
        );
    }
}
>>>>>>> REPLACE
````

---

## Phase 2：项目配置文件（P4 ~ P12）

### Patch 4 — 新增 `src/utils/project-config.ts`

独立一个模块：类型定义 + 向上走查 + 加载与校验。`MAX_WALK_DEPTH = 32` 挡住 symlink 循环等极端情况。

````patch
# src/utils/project-config.ts
<<<<<<< CREATE
=======
/**
 * Project-level config (.siyuan-cli.yaml) discovery, loading, and validation.
 *
 * Resolution model: walk upward from cwd until we find a .siyuan-cli.yaml,
 * stopping at $HOME (not inclusive), the filesystem root, or MAX_WALK_DEPTH.
 * The user's home ~/.siyuan-cli.yaml is *never* read to avoid colliding
 * semantically with the global XDG config.
 *
 * Hard errors:
 *   - PROJECT_CONFIG_PARSE_ERROR           (YAML unreadable/invalid)
 *   - PROJECT_CONFIG_VERSION_UNSUPPORTED   (schemaVersion != current)
 *   - PROJECT_CONFIG_REJECTED_FIELD        (token/baseUrl/tokenSource/defaults present)
 *   - PROJECT_CONFIG_WORKSPACE_NOT_FOUND   (workspace name not in AppConfig)
 *
 * Soft warnings:
 *   - UNKNOWN_PROJECT_CONFIG_KEY           (top-level key not recognized)
 *   - LIKELY_HPATH_NOT_ID / LIKELY_HPATH_NOT_ID_IN_PATH (same smoke-test as global)
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { parse } from 'yaml';
import { CliError, ExitCode } from './errors.js';
import type { AppConfig, PermissionConfig } from '../core/config.js';

export const PROJECT_CONFIG_FILENAME = '.siyuan-cli.yaml';
export const PROJECT_SCHEMA_VERSION = 1;
const MAX_WALK_DEPTH = 32;

const REJECTED_FIELDS = ['token', 'baseUrl', 'tokenSource', 'defaults'] as const;
const ALLOWED_TOP_LEVEL = new Set([
    'schemaVersion',
    'workspace',
    'permission'
]);
const ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/;
const ID_SEGMENT_RE = /\d{14}-[0-9a-z]{7}/;

export interface ProjectConfig {
    schemaVersion: number;
    workspace?: string;
    permission?: PermissionConfig;
}

export interface ProjectConfigLocation {
    /** Absolute path to the .siyuan-cli.yaml */
    path: string;
    /** Directory that contains the file */
    directory: string;
}

/**
 * Walk from startDir upward looking for .siyuan-cli.yaml.
 * Returns null if nothing is found before one of:
 *   - the directory equals $HOME (we stop before reading $HOME/.siyuan-cli.yaml)
 *   - the filesystem root is reached
 *   - MAX_WALK_DEPTH iterations elapse
 */
export function findProjectConfig(
    startDir: string
): ProjectConfigLocation | null {
    const home = resolve(homedir());
    let current = resolve(startDir);
    for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
        // Never read $HOME/.siyuan-cli.yaml — that would collide with the XDG config
        if (current === home) return null;
        const candidate = join(current, PROJECT_CONFIG_FILENAME);
        if (existsSync(candidate)) {
            return { path: candidate, directory: current };
        }
        const parent = dirname(current);
        if (parent === current) return null; // filesystem root
        current = parent;
    }
    return null;
}

function warnProjectPermissionSmoke(
    location: ProjectConfigLocation,
    permission: PermissionConfig | undefined
): void {
    if (!permission?.content) return;
    const scope = `project(${location.path})`;
    for (const access of ['read', 'write'] as const) {
        const rule = permission.content[access];
        if (!rule) continue;
        for (const bucket of ['allow', 'deny'] as const) {
            for (const nb of rule.notebooks?.[bucket] ?? []) {
                if (!ID_PATTERN.test(nb)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID',
                            scope,
                            at: `permission.content.${access}.notebooks.${bucket}`,
                            value: nb
                        }) + '\n'
                    );
                }
            }
            for (const p of rule.paths?.[bucket] ?? []) {
                if (!ID_SEGMENT_RE.test(p)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID_IN_PATH',
                            scope,
                            at: `permission.content.${access}.paths.${bucket}`,
                            value: p
                        }) + '\n'
                    );
                }
            }
        }
    }
}

/**
 * Load and validate a project config file. Throws on hard errors.
 * Writes soft warnings to stderr for suspicious-but-not-fatal content.
 *
 * `appConfig` is passed in so we can verify that `workspace: <name>` refers
 * to a known workspace — this check runs at load time, Request §validation #1.
 */
export function loadProjectConfig(
    location: ProjectConfigLocation,
    appConfig: AppConfig
): ProjectConfig {
    let raw: string;
    try {
        raw = readFileSync(location.path, 'utf-8');
    } catch (e) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_PARSE_ERROR',
            `Cannot read project config at ${location.path}: ${e instanceof Error ? e.message : String(e)}`
        );
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = (parse(raw) as Record<string, unknown>) ?? {};
    } catch (e) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_PARSE_ERROR',
            `Invalid YAML in project config at ${location.path}: ${e instanceof Error ? e.message : String(e)}`,
            'Fix the YAML syntax or remove the file to fall back to global config.'
        );
    }

    // Rejected fields: project files are safe to commit precisely because they
    // cannot hold credentials or connection overrides.
    for (const field of REJECTED_FIELDS) {
        if (field in parsed) {
            throw new CliError(
                ExitCode.CONFIG,
                'PROJECT_CONFIG_REJECTED_FIELD',
                `Field "${field}" is not allowed in ${PROJECT_CONFIG_FILENAME} (${location.path}).`,
                'Connection details belong in the global config only. Remove this field.'
            );
        }
    }

    // Unknown top-level keys: soft warning (forward compatibility)
    for (const key of Object.keys(parsed)) {
        if (!ALLOWED_TOP_LEVEL.has(key)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'UNKNOWN_PROJECT_CONFIG_KEY',
                    at: location.path,
                    key
                }) + '\n'
            );
        }
    }

    // schemaVersion: hard error on mismatch
    const schemaVersion = (parsed['schemaVersion'] as number | undefined) ?? 1;
    if (schemaVersion !== PROJECT_SCHEMA_VERSION) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_VERSION_UNSUPPORTED',
            `Project config schemaVersion ${schemaVersion} at ${location.path} is unsupported. Expected ${PROJECT_SCHEMA_VERSION}.`
        );
    }

    const workspace = parsed['workspace'];
    if (workspace !== undefined && typeof workspace !== 'string') {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_PARSE_ERROR',
            `Field "workspace" in ${location.path} must be a string.`
        );
    }
    if (workspace && !appConfig.workspaces[workspace]) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_WORKSPACE_NOT_FOUND',
            `Project config at ${location.path} references workspace "${workspace}" which is not defined in the global config.`,
            `Run \`siyuan workspace add ${workspace} --url <url>\` to register it.`
        );
    }

    const permission = parsed['permission'] as PermissionConfig | undefined;

    const result: ProjectConfig = {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        ...(workspace ? { workspace } : {}),
        ...(permission ? { permission } : {})
    };

    warnProjectPermissionSmoke(location, permission);

    return result;
}
>>>>>>> REPLACE
````

### Patch 5 — `config.ts` 顶部追加 project-config import

**文件**：`src/core/config.ts`

因为项目是 ESM，不能用 lazy `require()`。改用 static import。为了不扩大其他 patch 的 SEARCH 范围，单独一个 patch 处理顶部 imports。

注意：`project-config.ts` 只对 `config.ts` 的类型有依赖（`AppConfig`, `PermissionConfig`），全部用 `import type`，运行时无循环依赖。

````patch
# src/core/config.ts
<<<<<<< SEARCH
import { getConfigPath } from '../utils/paths.js';
import { CliError, ExitCode } from '../utils/errors.js';
import type { EndpointMode, EndpointScope, EndpointSurface } from './schema.js';
=======
import { getConfigPath } from '../utils/paths.js';
import {
    findProjectConfig,
    loadProjectConfig
} from '../utils/project-config.js';
import { CliError, ExitCode } from '../utils/errors.js';
import type { EndpointMode, EndpointScope, EndpointSurface } from './schema.js';
>>>>>>> REPLACE
````

### Patch 6 — 在 `config.ts` 增加 `resolveEffectiveWorkspace`

**文件**：`src/core/config.ts`

这是新的"一站式"入口。`resolveEffectiveWorkspace` 做的事：

1. 发现项目文件（如果有）
2. 确定 workspace 名字（flag > env > project-file > global-current）
3. 回调 `resolveWorkspace` 组装基础结果
4. 附着 `effectivePermission` 和 `projectConfigPath`（当 project-file 存在时）

注意 `effectivePermission` **始终来自 project-file（如果有）**，不受 workspace 是否被 flag 覆盖影响。这是上文"设计决策 #1"。

**实现位置**：插入到 `resolveTokenSource` 之后、`resolveWorkspace` 之前。这样 Patch 6 的 SEARCH 区域与 Patch 2 完全不重叠，可独立模拟/应用。函数声明有 hoisting，即使 `resolveEffectiveWorkspace` 先于 `resolveWorkspace` 声明也能正常调用后者。

````patch
# src/core/config.ts
<<<<<<< SEARCH
function resolveTokenSource(source?: TokenSource): string | undefined {
    if (!source) return undefined;
    if (source.type === 'env') return process.env[source.value];
    if (source.type === 'file')
        return readFileSync(source.value, 'utf-8').split(/\r?\n/, 1)[0]?.trim();
    if (source.type === 'command')
        return execSync(source.value, { encoding: 'utf-8' }).trim();
    return undefined;
}
=======
function resolveTokenSource(source?: TokenSource): string | undefined {
    if (!source) return undefined;
    if (source.type === 'env') return process.env[source.value];
    if (source.type === 'file')
        return readFileSync(source.value, 'utf-8').split(/\r?\n/, 1)[0]?.trim();
    if (source.type === 'command')
        return execSync(source.value, { encoding: 'utf-8' }).trim();
    return undefined;
}

/**
 * Resolve the effective workspace for a business invocation (api/tool).
 * Extends resolveWorkspace() with:
 *   - .siyuan-cli.yaml discovery (walks up from `cwd`)
 *   - project-file workspace name (priority between env and global-current)
 *   - project-file permission override (attached as effectivePermission)
 *
 * Workspace-management commands (add/list/use/remove/verify/show) should keep
 * using resolveWorkspace() directly — they operate on the global config and
 * should not be perturbed by the current directory.
 */
export function resolveEffectiveWorkspace(
    config: AppConfig,
    overrides: WorkspaceOverrides = {},
    cwd: string = process.cwd()
): ResolvedWorkspace {
    // ad-hoc mode short-circuits everything. No project file, no permission.
    if (overrides.baseUrl) {
        return resolveWorkspace(config, overrides);
    }

    const location = findProjectConfig(cwd);
    const projectConfig = location ? loadProjectConfig(location, config) : null;

    // Stitch project-file workspace into the cascade between env and global-current.
    // resolveWorkspace() does not know about project files, so we pre-fill overrides
    // only when the higher-priority sources (flag/env) did not already win.
    const effectiveOverrides: WorkspaceOverrides = { ...overrides };
    let sourceHintFromProject = false;
    if (
        !effectiveOverrides.workspace &&
        !process.env['SIYUAN_CLI_WORKSPACE'] &&
        projectConfig?.workspace
    ) {
        effectiveOverrides.workspace = projectConfig.workspace;
        sourceHintFromProject = true;
    }

    const base = resolveWorkspace(config, effectiveOverrides);

    // If the workspace name came from the project file, rewrite source accordingly.
    // resolveWorkspace() reported 'flag' because we pre-filled overrides.workspace;
    // here we correct it back to 'project-file' for accurate provenance.
    const source: WorkspaceResolutionSource = sourceHintFromProject
        ? 'project-file'
        : base.source;

    // Project permission is independent of how the workspace name was chosen.
    // This is the intentional decision: a project config expresses "in this dir,
    // operate under these rules" — valid even when --workspace flips the target.
    return {
        ...base,
        source,
        ...(projectConfig?.permission
            ? { effectivePermission: projectConfig.permission }
            : {}),
        ...(location ? { projectConfigPath: location.path } : {})
    };
}
>>>>>>> REPLACE
````

### Patch 7 — `PermissionEngine` 支持项目 permission 覆盖

**文件**：`src/core/permission.ts`

改动：
- `PermissionEngine` 构造函数和 `createPermissionEngine` 改为接受已经解析好的 `PermissionConfig`，而不是 `(config, workspaceName)`。
- 当 `resolved.effectivePermission` 存在时，它**完全替换**cascade 结果（Request §permission-merge-strategy）。
- 新增 `resolveEffectivePermission` 辅助函数，把两层合并规则封装起来。

这是全 patch 中唯一改签名的改动。所有调用点（Patch 8/9）同步修改。

````patch
# src/core/permission.ts
<<<<<<< SEARCH
import micromatch from 'micromatch';
import type { AppConfig, PermissionConfig } from './config.js';
import type {
    PermissionEngineLike,
    RegisteredEndpoint,
    ResourceKind
} from './schema.js';
import { CliError, ExitCode } from '../utils/errors.js';
import type { SiyuanClient } from './client.js';

function getPermission(
    config: AppConfig,
    workspaceName: string
): PermissionConfig {
    const ws = config.workspaces[workspaceName];
    const defaults = config.defaults?.permission;
    return {
        endpoints: ws?.permission?.endpoints ?? defaults?.endpoints,
        tools: ws?.permission?.tools ?? defaults?.tools,
        content: {
            read: ws?.permission?.content?.read ?? defaults?.content?.read,
            write: ws?.permission?.content?.write ?? defaults?.content?.write
        },
        workspace: {
            read: ws?.permission?.workspace?.read ?? defaults?.workspace?.read,
            write:
                ws?.permission?.workspace?.write ?? defaults?.workspace?.write
        } as PermissionConfig['workspace'],
        confirm: ws?.permission?.confirm ?? defaults?.confirm
    };
}
=======
import micromatch from 'micromatch';
import type {
    AppConfig,
    PermissionConfig,
    ResolvedWorkspace
} from './config.js';
import type {
    PermissionEngineLike,
    RegisteredEndpoint,
    ResourceKind
} from './schema.js';
import { CliError, ExitCode } from '../utils/errors.js';
import type { SiyuanClient } from './client.js';

function cascadeWorkspacePermission(
    config: AppConfig,
    workspaceName: string
): PermissionConfig {
    const ws = config.workspaces[workspaceName];
    const defaults = config.defaults?.permission;
    return {
        endpoints: ws?.permission?.endpoints ?? defaults?.endpoints,
        tools: ws?.permission?.tools ?? defaults?.tools,
        content: {
            read: ws?.permission?.content?.read ?? defaults?.content?.read,
            write: ws?.permission?.content?.write ?? defaults?.content?.write
        },
        workspace: {
            read: ws?.permission?.workspace?.read ?? defaults?.workspace?.read,
            write:
                ws?.permission?.workspace?.write ?? defaults?.workspace?.write
        } as PermissionConfig['workspace'],
        confirm: ws?.permission?.confirm ?? defaults?.confirm
    };
}

/**
 * Resolve the PermissionConfig that the engine should enforce.
 *
 * If the resolved workspace carries `effectivePermission` (from .siyuan-cli.yaml),
 * it COMPLETELY REPLACES the cascade — no merge with workspace-level or
 * defaults-level permission. See docs/extending/31-workspace-resolution.md for
 * the rationale.
 *
 * Otherwise, the standard two-layer cascade (workspace ?? defaults) applies.
 */
export function resolveEffectivePermission(
    config: AppConfig,
    resolved: ResolvedWorkspace
): PermissionConfig {
    if (resolved.effectivePermission) {
        return resolved.effectivePermission;
    }
    return cascadeWorkspacePermission(config, resolved.name);
}
>>>>>>> REPLACE
````

接着调整 `PermissionEngine` 构造函数，让它直接接受 `PermissionConfig`：

````patch
# src/core/permission.ts
<<<<<<< SEARCH
export class PermissionEngine implements PermissionEngineLike {
    private readonly perm: PermissionConfig;
    private readonly client: SiyuanClient;
    private readonly idCache = new Map<
        string,
        { notebook: string; path: string }
    >();

    constructor(
        config: AppConfig,
        workspaceName: string,
        client: SiyuanClient
    ) {
        this.perm = getPermission(config, workspaceName);
        this.client = client;
    }
=======
export class PermissionEngine implements PermissionEngineLike {
    private readonly perm: PermissionConfig;
    private readonly client: SiyuanClient;
    private readonly idCache = new Map<
        string,
        { notebook: string; path: string }
    >();

    constructor(perm: PermissionConfig, client: SiyuanClient) {
        this.perm = perm;
        this.client = client;
    }
>>>>>>> REPLACE
````

最后修改 `createPermissionEngine`：

````patch
# src/core/permission.ts
<<<<<<< SEARCH
export function createPermissionEngine(
    config: AppConfig,
    workspaceName: string,
    client: SiyuanClient
): PermissionEngine {
    return new PermissionEngine(config, workspaceName, client);
}
=======
export function createPermissionEngine(
    config: AppConfig,
    resolved: ResolvedWorkspace,
    client: SiyuanClient
): PermissionEngine {
    const perm = resolveEffectivePermission(config, resolved);
    return new PermissionEngine(perm, client);
}
>>>>>>> REPLACE
````

### Patch 8 — `IMPLICIT_WORKSPACE` 警告

**文件**：`src/core/guard.ts`

规则（上文"设计决策 #2"）：`source === 'global-current'` 且 `risk ∈ {elevated, destructive, critical}` 时，在 `executeEndpoint` 里往 stderr 写 `IMPLICIT_WORKSPACE` 警告。这不会中断调用。

为了知道 `source`，需要把 `ResolvedWorkspace` 传进 `executeEndpoint`。做法：在 `ExecuteOptions` 上加可选的 `workspace?: ResolvedWorkspace`。向后兼容——不传则不警告。

````patch
# src/core/guard.ts
<<<<<<< SEARCH
import {
    deriveEndpointId,
    evaluatePointerPath,
    runPointerFilterTerminal,
    type EndpointSchema,
    type PermissionEngineLike,
    type RegisteredEndpoint
} from './schema.js';
import {
    ConfirmationRequiredError,
    ContentAccessDeniedError,
    type PermissionEngine
} from './permission.js';
import type { SiyuanClient } from './client.js';
=======
import {
    deriveEndpointId,
    evaluatePointerPath,
    runPointerFilterTerminal,
    type EndpointSchema,
    type PermissionEngineLike,
    type RegisteredEndpoint
} from './schema.js';
import {
    ConfirmationRequiredError,
    ContentAccessDeniedError,
    type PermissionEngine
} from './permission.js';
import type { SiyuanClient } from './client.js';
import type { ResolvedWorkspace } from './config.js';

const RISK_TRIGGERS_IMPLICIT_WARNING = new Set<string>([
    'elevated',
    'destructive',
    'critical'
]);

function maybeWarnImplicitWorkspace(
    entry: RegisteredEndpoint,
    workspace: ResolvedWorkspace | undefined
): void {
    if (!workspace) return;
    if (workspace.source !== 'global-current') return;
    if (!RISK_TRIGGERS_IMPLICIT_WARNING.has(entry.meta.risk)) return;
    process.stderr.write(
        JSON.stringify({
            warning: 'IMPLICIT_WORKSPACE',
            endpoint: entry.id,
            workspace: workspace.name,
            risk: entry.meta.risk,
            hint: 'Resolved from global config.current. Pass --workspace, set $SIYUAN_CLI_WORKSPACE, or add .siyuan-cli.yaml to anchor the target.'
        }) + '\n'
    );
}
>>>>>>> REPLACE
````

````patch
# src/core/guard.ts
<<<<<<< SEARCH
export interface ExecuteOptions {
    entry: RegisteredEndpoint;
    payload: unknown;
    client: SiyuanClient;
    engine: PermissionEngine;
    dryRun?: boolean;
    yes?: boolean;
    debug?: boolean;
}
=======
export interface ExecuteOptions {
    entry: RegisteredEndpoint;
    payload: unknown;
    client: SiyuanClient;
    engine: PermissionEngine;
    /** Optional — when supplied, enables IMPLICIT_WORKSPACE warning on write-like risks. */
    workspace?: ResolvedWorkspace;
    dryRun?: boolean;
    yes?: boolean;
    debug?: boolean;
}
>>>>>>> REPLACE
````

````patch
# src/core/guard.ts
<<<<<<< SEARCH
export async function executeEndpoint(opts: ExecuteOptions): Promise<unknown> {
    const { entry, payload, client, engine, dryRun, yes, debug } = opts;
    const { schema } = entry;
    const { id } = deriveEndpointId(schema.endpoint);

    engine.checkEndpoint(id);
    await applyPayloadGuard(
        schema,
        payload,
        engine,
        entry.meta.classification.mode === 'read' ? 'read' : 'write',
        entry.meta.classification.surface
    );
=======
export async function executeEndpoint(opts: ExecuteOptions): Promise<unknown> {
    const {
        entry,
        payload,
        client,
        engine,
        workspace,
        dryRun,
        yes,
        debug
    } = opts;
    const { schema } = entry;
    const { id } = deriveEndpointId(schema.endpoint);

    maybeWarnImplicitWorkspace(entry, workspace);
    engine.checkEndpoint(id);
    await applyPayloadGuard(
        schema,
        payload,
        engine,
        entry.meta.classification.mode === 'read' ? 'read' : 'write',
        entry.meta.classification.surface
    );
>>>>>>> REPLACE
````

### Patch 9 — `tools.ts` 使用新解析链

**文件**：`src/core/tools.ts`

切换到 `resolveEffectiveWorkspace`，并把 `workspace` 传给 `executeEndpoint` 以启用警告。

````patch
# src/core/tools.ts
<<<<<<< SEARCH
import { registry as endpointRegistry } from './registry.js';
import { loadConfig, resolveWorkspace } from './config.js';
import { SiyuanClient } from './client.js';
import { createPermissionEngine } from './permission.js';
import { executeEndpoint } from './guard.js';
import type {
    GlobalArgs,
    ToolContext,
    ToolResult,
    ToolSchema
} from './schema.js';
=======
import { registry as endpointRegistry } from './registry.js';
import { loadConfig, resolveEffectiveWorkspace } from './config.js';
import { SiyuanClient } from './client.js';
import { createPermissionEngine } from './permission.js';
import { executeEndpoint } from './guard.js';
import type {
    GlobalArgs,
    ToolContext,
    ToolResult,
    ToolSchema
} from './schema.js';
>>>>>>> REPLACE
````

````patch
# src/core/tools.ts
<<<<<<< SEARCH
export async function createToolContext(
    args: GlobalArgs,
    toolId?: string
): Promise<ToolContext> {
    const config = loadConfig(args.config);
    const workspace = resolveWorkspace(config, {
        workspace: args.workspace,
        baseUrl: args.baseUrl,
        token: args.token
    });
    const client = new SiyuanClient(workspace);
    const permission = createPermissionEngine(config, workspace.name, client);
    if (toolId) permission.checkTool(toolId);

    const callEndpoint: ToolContext['callEndpoint'] = async <T = unknown>(
        id: string,
        payload: unknown
    ): Promise<T> => {
        const entry = endpointRegistry.get(id);
        if (!entry) throw new Error(`Endpoint "${id}" not found.`);
        return executeEndpoint({
            entry,
            payload,
            client,
            engine: permission,
            dryRun: args.dryRun,
            yes: args.yes,
            debug: args.debug
        }) as Promise<T>;
    };
=======
export async function createToolContext(
    args: GlobalArgs,
    toolId?: string
): Promise<ToolContext> {
    const config = loadConfig(args.config);
    const workspace = resolveEffectiveWorkspace(config, {
        workspace: args.workspace,
        baseUrl: args.baseUrl,
        token: args.token
    });
    const client = new SiyuanClient(workspace);
    const permission = createPermissionEngine(config, workspace, client);
    if (toolId) permission.checkTool(toolId);

    const callEndpoint: ToolContext['callEndpoint'] = async <T = unknown>(
        id: string,
        payload: unknown
    ): Promise<T> => {
        const entry = endpointRegistry.get(id);
        if (!entry) throw new Error(`Endpoint "${id}" not found.`);
        return executeEndpoint({
            entry,
            payload,
            client,
            engine: permission,
            workspace,
            dryRun: args.dryRun,
            yes: args.yes,
            debug: args.debug
        }) as Promise<T>;
    };
>>>>>>> REPLACE
````

### Patch 10 — `api.ts` 使用新解析链

**文件**：`src/commands/api.ts`

同样切换 + 把 `workspace` 传给 `executeEndpoint`。

````patch
# src/commands/api.ts
<<<<<<< SEARCH
import { defineCommand } from 'citty';
import { registry } from '../core/registry.js';
import { loadConfig, resolveWorkspace } from '../core/config.js';
import { SiyuanClient } from '../core/client.js';
import { createPermissionEngine } from '../core/permission.js';
import { executeEndpoint } from '../core/guard.js';
import { parsePayload } from '../core/argv.js';
import { fatalError, toCliError } from '../utils/errors.js';
import type { RegisteredEndpoint } from '../core/schema.js';
=======
import { defineCommand } from 'citty';
import { registry } from '../core/registry.js';
import { loadConfig, resolveEffectiveWorkspace } from '../core/config.js';
import { SiyuanClient } from '../core/client.js';
import { createPermissionEngine } from '../core/permission.js';
import { executeEndpoint } from '../core/guard.js';
import { parsePayload } from '../core/argv.js';
import { fatalError, toCliError } from '../utils/errors.js';
import type { RegisteredEndpoint } from '../core/schema.js';
>>>>>>> REPLACE
````

````patch
# src/commands/api.ts
<<<<<<< SEARCH
    const config = loadConfig(rawArgs['config'] as string | undefined);

    const workspace = resolveWorkspace(config, {
        workspace: rawArgs['workspace'] as string | undefined,
        baseUrl: rawArgs['baseUrl'] as string | undefined,
        token: rawArgs['token'] as string | undefined
    });
    const client = new SiyuanClient(workspace);
    const engine = createPermissionEngine(config, workspace.name, client);

    const result = await executeEndpoint({
        entry,
        payload,
        client,
        engine,
        dryRun: rawArgs['dry-run'] as boolean | undefined,
        yes: rawArgs['yes'] as boolean | undefined,
        debug: rawArgs['debug'] as boolean | undefined
    });
    out(result);
}
=======
    const config = loadConfig(rawArgs['config'] as string | undefined);

    const workspace = resolveEffectiveWorkspace(config, {
        workspace: rawArgs['workspace'] as string | undefined,
        baseUrl: rawArgs['baseUrl'] as string | undefined,
        token: rawArgs['token'] as string | undefined
    });
    const client = new SiyuanClient(workspace);
    const engine = createPermissionEngine(config, workspace, client);

    const result = await executeEndpoint({
        entry,
        payload,
        client,
        engine,
        workspace,
        dryRun: rawArgs['dry-run'] as boolean | undefined,
        yes: rawArgs['yes'] as boolean | undefined,
        debug: rawArgs['debug'] as boolean | undefined
    });
    out(result);
}
>>>>>>> REPLACE
````

### Patch 11 — 新增 `siyuan workspace which` 命令

**文件**：`src/commands/workspace.ts`

纯本地调试工具：打印当前 cwd 下会采用哪个 workspace、来源、project-file 路径、有效 permission 摘要。不触网，不改状态。

````patch
# src/commands/workspace.ts
<<<<<<< SEARCH
import { defineCommand } from 'citty';
import {
    loadConfig,
    saveConfig,
    resolveWorkspace,
    type WorkspaceEntry
} from '../core/config.js';
import { SiyuanClient } from '../core/client.js';
import { CliError, ExitCode, fatalError, toCliError } from '../utils/errors.js';
=======
import { defineCommand } from 'citty';
import {
    loadConfig,
    saveConfig,
    resolveWorkspace,
    resolveEffectiveWorkspace,
    type WorkspaceEntry
} from '../core/config.js';
import { resolveEffectivePermission } from '../core/permission.js';
import { SiyuanClient } from '../core/client.js';
import { CliError, ExitCode, fatalError, toCliError } from '../utils/errors.js';
>>>>>>> REPLACE
````

再在导出前、`removeCommand` 之后插入 `whichCommand`：

````patch
# src/commands/workspace.ts
<<<<<<< SEARCH
// ─── Export ───────────────────────────────────────────────────────────────────

export const workspaceCommand = defineCommand({
    meta: {
        name: 'workspace',
        description: 'Manage SiYuan workspace connections.'
    },
    subCommands: {
        add: addCommand,
        list: listCommand,
        use: useCommand,
        verify: verifyCommand,
        show: showCommand,
        remove: removeCommand
    }
});
=======
// ─── which ────────────────────────────────────────────────────────────────────

const whichCommand = defineCommand({
    meta: {
        name: 'which',
        description:
            'Show how workspace resolution works in the current directory.'
    },
    args: {
        cwd: {
            type: 'string',
            description: 'Directory to resolve from (defaults to current)',
            required: false
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            const config = loadConfig();
            const resolved = resolveEffectiveWorkspace(
                config,
                {},
                args.cwd ?? process.cwd()
            );
            const effectivePerm = resolveEffectivePermission(config, resolved);
            const permissionSummary = {
                hasEndpointsRule: !!effectivePerm.endpoints,
                hasToolsRule: !!effectivePerm.tools,
                hasContentRead: !!effectivePerm.content?.read,
                hasContentWrite: !!effectivePerm.content?.write,
                hasWorkspaceRead: !!effectivePerm.workspace?.read,
                hasWorkspaceWrite: !!effectivePerm.workspace?.write,
                hasConfirmPolicy: !!effectivePerm.confirm
            };
            out({
                workspace: resolved.name,
                source: resolved.source,
                baseUrl: resolved.baseUrl,
                hasToken: !!resolved.token,
                projectConfigPath: resolved.projectConfigPath ?? null,
                permissionOverriddenByProject: !!resolved.effectivePermission,
                permission: permissionSummary
            });
        })
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const workspaceCommand = defineCommand({
    meta: {
        name: 'workspace',
        description: 'Manage SiYuan workspace connections.'
    },
    subCommands: {
        add: addCommand,
        list: listCommand,
        use: useCommand,
        verify: verifyCommand,
        show: showCommand,
        remove: removeCommand,
        which: whichCommand
    }
});
>>>>>>> REPLACE
````

### Patch 12 — `.siyuan-cli.yaml.example` 模板

**文件**：`.siyuan-cli.yaml.example`（repo 根）

````patch
# .siyuan-cli.yaml.example
<<<<<<< CREATE
=======
# .siyuan-cli.yaml — project-level siyuan-cli config
#
# Copy this file to `.siyuan-cli.yaml` in your project root and edit to taste.
# Once present, `siyuan api ...` and `siyuan tool ...` invoked from this directory
# (or any subdirectory) will use the settings below to resolve workspace and
# enforce permissions — overriding the global config.current.
#
# IMPORTANT: this file is safe to commit. siyuan-cli hard-errors if you try to
# put `token`, `baseUrl`, `tokenSource`, or `defaults` here. Connection details
# belong in the global config (~/.config/siyuan-cli/config.yaml) only.
#
# Two usage patterns:
#   1) Shared — commit .siyuan-cli.yaml; all collaborators share workspace choice.
#   2) Personal — gitignore .siyuan-cli.yaml, commit .siyuan-cli.yaml.example only.
#
# Validated at load time:
#   - schemaVersion must be 1
#   - workspace (if set) must exist in global config.workspaces
#   - token/baseUrl/tokenSource/defaults → hard error
#   - unknown top-level keys → stderr warning
#   - permission rules that look like hpath → stderr warning

schemaVersion: 1

# (Optional) Which workspace from the global config to use when invoked here.
# If omitted, the fallback chain continues: $SIYUAN_CLI_WORKSPACE > config.current.
workspace: prod

# (Optional) Permission block. If present, it COMPLETELY REPLACES the
# cascade workspaces[name].permission ?? defaults.permission for this invocation.
# Shape is identical to the global permission block (see docs/extending/30-config.md).
permission:
  endpoints:
    deny:
      - block.delete*
      - system.exit

  # Notebook ids and id-based paths only — NOT human-readable hpath.
  content:
    read:
      notebooks:
        allow:
          - 20260101215354-j0c5gvk
    write:
      paths:
        deny:
          - /20260107143325-zbrtqup/**

  # Extra confirmation triggers (on top of risk-derived auto-confirm)
  confirm:
    modes: [write, invoke]
    surfaces: [workspace, network]
>>>>>>> REPLACE
````

---

## Phase 3：文档（P13 ~ P16）

### Patch 13 — 新文档 `31-workspace-resolution.md`

**文件**：`src/docs/extending/31-workspace-resolution.md`

这是 workspace 解析链的完整说明——从无（旧）到现在的演变、project-file 的决策理由、排错路径。

`````patch
# src/docs/extending/31-workspace-resolution.md
<<<<<<< CREATE
=======
---
title: Workspace Resolution
slug: workspace-resolution
summary: How siyuan-cli determines the active workspace per invocation, including .siyuan-cli.yaml discovery and permission override rules.
---

# Workspace Resolution

GATE: read when the workspace picked by an invocation doesn't match what you expected, or when designing how an agent anchors its target workspace across sessions.

## Resolution chain

```text
--workspace flag
  > $SIYUAN_CLI_WORKSPACE env
  > .siyuan-cli.yaml    (walk up from cwd; do NOT read $HOME)
  > config.current      (global YAML fallback; emits IMPLICIT_WORKSPACE on writes)
```

`--baseUrl` short-circuits everything else and yields an ad-hoc workspace with `source = "ad-hoc"`. No project file is consulted, no permission is inherited.

## ResolvedWorkspace.source

Each invocation produces a `ResolvedWorkspace` with a `source` tag describing which step of the chain won:

| `source` | Meaning |
|---|---|
| `flag` | picked by `--workspace` |
| `env` | picked by `$SIYUAN_CLI_WORKSPACE` |
| `project-file` | picked by `workspace:` in a discovered `.siyuan-cli.yaml` |
| `global-current` | fell through to `config.current` |
| `ad-hoc` | `--baseUrl` was used; no named workspace involved |

The source is threaded through to the guard layer so that write-like operations resolved via `global-current` emit an `IMPLICIT_WORKSPACE` warning (see below).

## `.siyuan-cli.yaml` discovery

`siyuan` walks upward from the current directory looking for a `.siyuan-cli.yaml`. It stops at the first match, or when any of these is reached:

- the user's `$HOME` (exclusive — `~/.siyuan-cli.yaml` is never read)
- the filesystem root
- `MAX_WALK_DEPTH = 32`

Example layout:

```text
monorepo/
  .siyuan-cli.yaml        # workspace: prod
  subproject-a/
    .siyuan-cli.yaml      # workspace: dev
  subproject-b/
    (no project file)
```

Invocation behavior:

| cwd | Found file | Active workspace (assuming no `--workspace` / env) |
|---|---|---|
| `monorepo/` | `monorepo/.siyuan-cli.yaml` | `prod` |
| `monorepo/subproject-a/` | `subproject-a/.siyuan-cli.yaml` | `dev` |
| `monorepo/subproject-b/` | `monorepo/.siyuan-cli.yaml` | `prod` (walked up to the shared file) |
| `/unrelated/` | none | falls back to `config.current` |

Resolution does **not** merge files found on the way up — first hit wins.

## File format

```yaml
schemaVersion: 1            # required; must equal 1
workspace: prod             # optional; must exist in global config.workspaces
permission:                 # optional; same shape as global permission block
  endpoints:
    deny: ["system.exit"]
  content:
    write:
      paths:
        deny: ["/20260107143325-zbrtqup/**"]
```

## Field rules (hard-enforced at load time)

| Field | Rule | On violation |
|---|---|---|
| `schemaVersion` | must equal `1` | `PROJECT_CONFIG_VERSION_UNSUPPORTED` (exit 2) |
| `workspace` | must be a string and exist in `config.workspaces` | `PROJECT_CONFIG_WORKSPACE_NOT_FOUND` (exit 2) |
| `token` / `baseUrl` / `tokenSource` / `defaults` | never allowed | `PROJECT_CONFIG_REJECTED_FIELD` (exit 2) |
| unknown top-level keys | allowed but flagged | stderr warning `UNKNOWN_PROJECT_CONFIG_KEY` |
| `permission.content.notebooks.*` entries | must match kernel id pattern `^\d{14}-[0-9a-z]{7}$` | stderr warning `LIKELY_HPATH_NOT_ID` |
| `permission.content.paths.*` entries | must contain a kernel id segment | stderr warning `LIKELY_HPATH_NOT_ID_IN_PATH` |
| YAML parse failure | never OK | `PROJECT_CONFIG_PARSE_ERROR` (exit 2) |

**Rationale for rejecting connection fields**: by construction, the project file cannot hold credentials. It is safe to commit. The global config (`~/.config/siyuan-cli/config.yaml`) is the sole source of `baseUrl` / `token`.

## Permission override semantics

When a project file declares `permission`, it **completely replaces** the cascade `workspaces[name].permission ?? defaults.permission`. There is **no merge** with either layer.

Rationale: a project config expresses "in this directory, operations must satisfy these rules" as a complete assertion. Merging would allow unrelated global rules to leak in and dilute the project's intent. This mirrors the existing `workspace ?? defaults` two-layer replacement — consistency matters.

If you find yourself duplicating rules across many project files, that is the signal for a future `extends:` mechanism (Phase 3, not currently implemented). Open an issue with concrete examples.

## Independence of workspace selection and permission

The project file's `permission` block is **independent of how the workspace name was determined**. If you run:

```sh
cd projectA                          # .siyuan-cli.yaml says workspace: dev, permission: { ... }
siyuan --workspace prod api query.sql "..."
```

then:

- the workspace becomes `prod` (source: `flag`)
- the project's `permission` block **still applies**
- `resolved.source = "flag"` but `resolved.projectConfigPath` is still set

Rationale: `--workspace` expresses "I want a different target right now", while the project file expresses "whenever I operate from this directory, these rules apply". They are orthogonal, and honoring both is the safe interpretation.

## The `IMPLICIT_WORKSPACE` warning

Emitted to stderr when **both** are true:

1. `resolved.source === "global-current"` (the lowest priority source)
2. the endpoint's derived risk is `elevated`, `destructive`, or `critical`

```json
{"warning":"IMPLICIT_WORKSPACE","endpoint":"block.updateBlock","workspace":"home","risk":"elevated","hint":"Resolved from global config.current. Pass --workspace, set $SIYUAN_CLI_WORKSPACE, or add .siyuan-cli.yaml to anchor the target."}
```

Why risk-based and not mode-based:

- `sensitive` reads (e.g. `block.getBlockKramdown`) don't warn — reading the wrong workspace is annoying but not destructive.
- `notification.pushMsg` (`riskOverride: "safe"`) doesn't warn — UI toast on the wrong window at worst.
- `system.exit` (`riskOverride: "critical"`) **does** warn — killing the wrong kernel is a real incident.

The warning does not change exit code. Agents should treat it as a signal to add `--workspace` or a project file.

## Debugging: `siyuan workspace which`

Read-only observation of the current directory's resolution:

```sh
$ cd ~/projects/myproj
$ siyuan workspace which
{
  "workspace": "prod",
  "source": "project-file",
  "baseUrl": "http://127.0.0.1:6806",
  "hasToken": true,
  "projectConfigPath": "/home/user/projects/myproj/.siyuan-cli.yaml",
  "permissionOverriddenByProject": true,
  "permission": {
    "hasEndpointsRule": true,
    "hasToolsRule": false,
    "hasContentRead": false,
    "hasContentWrite": true,
    "hasWorkspaceRead": false,
    "hasWorkspaceWrite": false,
    "hasConfirmPolicy": false
  }
}
```

This command does not touch the kernel and does not modify any state. Safe to run in any agent context.

## gitignore strategy

Two patterns, pick one per project:

1. **Shared** — commit `.siyuan-cli.yaml`. All collaborators automatically use the same workspace name.
2. **Personal** — gitignore `.siyuan-cli.yaml`, commit `.siyuan-cli.yaml.example`. Each developer copies and customizes locally.

Both are safe because the file cannot contain credentials. Pick shared when "the right workspace for this project" is a property of the project; pick personal when it is a property of the user.

## What is NOT added

From the original design (request `26-04-17T20-24_workspace-session-isolation.md`):

- **No `siyuan workspace use --local` command**: manual YAML edit is simpler; the subcommand introduces create-or-update ambiguity. Reconsider after user feedback.
- **No merge with `~/.siyuan-cli.yaml`**: redundant with global XDG config.
- **No three-layer permission merge**: project file replaces, period.
- **No aliasing of notebook ids**: revisit only if users report real readability pain.

## One-line summary

**`.siyuan-cli.yaml` anchors the workspace and permission model to a directory tree. First hit while walking up from cwd wins. Safe to commit. `workspace which` to inspect.**
>>>>>>> REPLACE
`````

### Patch 14 — 更新 `30-config.md`

**文件**：`src/docs/extending/30-config.md`

在文末追加「Project config file」章节，指向 31 号文档。

````patch
# src/docs/extending/30-config.md
<<<<<<< SEARCH
## One-line summary

**Config is layered: workspace overrides defaults. Permission is layered: risk-auto confirmation unions user `confirm` policy. Guards consult the engine, the engine consults the config.**
=======
## Project config file (`.siyuan-cli.yaml`)

A project-level file can override workspace selection and permission per directory tree. This is the recommended mechanism for:

- isolating concurrent agent sessions to different workspaces (the root motivation; see `31-workspace-resolution.md`)
- pinning "prod read-only" in one project directory and "prod read-write" in another without duplicating workspace entries
- making "which workspace does this project talk to" a property of the project, committable or not per team preference

See `31-workspace-resolution.md` for the full resolution chain, file format, validation rules, and permission-override semantics.

Short form:

```yaml
# .siyuan-cli.yaml (project root)
schemaVersion: 1
workspace: prod                      # must exist in global config
permission:                          # completely replaces global cascade
  endpoints:
    deny: ["block.delete*"]
  content:
    write:
      paths:
        deny: ["/20260107143325-zbrtqup/**"]
```

Fields `token`, `baseUrl`, `tokenSource`, `defaults` are hard-rejected at load time. The file is safe to commit.

## One-line summary

**Config is layered: workspace overrides defaults. Permission is layered: risk-auto confirmation unions user `confirm` policy. A project `.siyuan-cli.yaml` sits between `$SIYUAN_CLI_WORKSPACE` and `config.current` and can fully replace the permission cascade. Guards consult the engine, the engine consults the resolved config.**
>>>>>>> REPLACE
````

### Patch 15 — 更新 `90-errors-and-exit-codes.md`

**文件**：`src/docs/extending/90-errors-and-exit-codes.md`

在 catalog 表尾增加新错误码，并在"emitting warnings"部分举例新警告。

````patch
# src/docs/extending/90-errors-and-exit-codes.md
<<<<<<< SEARCH
| `ENDPOINT_NOT_FOUND` | 1 | commands/api.ts | `describe` / call unknown id |
| `TOOL_NOT_FOUND` | 1 | commands/tool.ts | unknown tool id |
=======
| `ENDPOINT_NOT_FOUND` | 1 | commands/api.ts | `describe` / call unknown id |
| `TOOL_NOT_FOUND` | 1 | commands/tool.ts | unknown tool id |
| `PROJECT_CONFIG_PARSE_ERROR` | 2 | utils/project-config.ts | `.siyuan-cli.yaml` unreadable or invalid YAML |
| `PROJECT_CONFIG_VERSION_UNSUPPORTED` | 2 | utils/project-config.ts | project file `schemaVersion` != current |
| `PROJECT_CONFIG_REJECTED_FIELD` | 2 | utils/project-config.ts | project file contains `token` / `baseUrl` / `tokenSource` / `defaults` |
| `PROJECT_CONFIG_WORKSPACE_NOT_FOUND` | 2 | utils/project-config.ts | project file `workspace:` name not in global config |
>>>>>>> REPLACE
````

````patch
# src/docs/extending/90-errors-and-exit-codes.md
<<<<<<< SEARCH
Framework-emitted warnings use a JSON shape:

```json
{"warning":"CONTENT_FILTERED","removed":2,"reasons":"2x: path /denied in read deny list"}
```

so agents can parse them.
=======
Framework-emitted warnings use a JSON shape:

```json
{"warning":"CONTENT_FILTERED","removed":2,"reasons":"2x: path /denied in read deny list"}
```

Other framework warnings agents should be aware of:

| Warning | Where | When |
|---|---|---|
| `CONTENT_FILTERED` | guard.ts | response guard removed items |
| `IMPLICIT_WORKSPACE` | guard.ts | write-like endpoint resolved workspace via `global-current` fallback |
| `LIKELY_HPATH_NOT_ID` | config.ts / utils/project-config.ts | notebook-rule entry doesn't match kernel id pattern |
| `LIKELY_HPATH_NOT_ID_IN_PATH` | config.ts / utils/project-config.ts | path-rule entry contains no kernel id segment |
| `UNKNOWN_PROJECT_CONFIG_KEY` | utils/project-config.ts | top-level key in `.siyuan-cli.yaml` not recognized |
| `CONFIG_MIGRATED` | config.ts | legacy `%APPDATA%` config migrated to XDG location |

All go to stderr and never change exit code. Agents can parse them line-by-line as JSON.
>>>>>>> REPLACE
````

### Patch 16 — 更新 `src/docs/README.md`

**文件**：`src/docs/README.md`

索引里加入 `31-workspace-resolution.md`。

````patch
# src/docs/README.md
<<<<<<< SEARCH
- `extending/30-config.md` — config.yaml shape, permission model, token sources
- `extending/40-adding-an-endpoint.md` — step-by-step for a public kernel API
=======
- `extending/30-config.md` — config.yaml shape, permission model, token sources
- `extending/31-workspace-resolution.md` — resolution chain, `.siyuan-cli.yaml`, permission override, `workspace which`
- `extending/40-adding-an-endpoint.md` — step-by-step for a public kernel API
>>>>>>> REPLACE
````

---

## 应用后验收清单

### 编译 & 基本功能

```bash
pnpm typecheck
pnpm build
node dist/cli.mjs workspace list
node dist/cli.mjs workspace which
node dist/cli.mjs api list | head -n 5
node dist/cli.mjs tool list
```

全部应该正常输出，不报错。

### Phase 1 — `IMPLICIT_WORKSPACE` 警告

在没有 `--workspace` 也没有 `$SIYUAN_CLI_WORKSPACE` 也没有 `.siyuan-cli.yaml` 的目录（例如 `/tmp`）：

```bash
cd /tmp
node <repo>/dist/cli.mjs api block.updateBlock -j '{"id":"..."}' --dry-run
# stderr 应出现：
# {"warning":"IMPLICIT_WORKSPACE","endpoint":"block.updateBlock","workspace":"...","risk":"elevated",...}
```

读操作不应触发：

```bash
node <repo>/dist/cli.mjs api query.sql "SELECT 1" | head
# stderr 无 IMPLICIT_WORKSPACE
```

### Phase 1 — 加载期校验

在 `~/.config/siyuan-cli/config.yaml` 的某个 workspace 里临时加入：

```yaml
permission:
  content:
    read:
      notebooks:
        allow: ["some/hpath/not/an/id"]
      paths:
        allow: ["/some/hpath/without/id"]
```

运行任意命令：

```bash
node <repo>/dist/cli.mjs workspace list
# stderr 应出现两条：
# {"warning":"LIKELY_HPATH_NOT_ID",...}
# {"warning":"LIKELY_HPATH_NOT_ID_IN_PATH",...}
```

测试完删掉这段。

### Phase 2 — project-file 隔离

```bash
mkdir -p /tmp/ws-iso-a /tmp/ws-iso-b
cat > /tmp/ws-iso-a/.siyuan-cli.yaml <<EOF
schemaVersion: 1
workspace: <你的第一个 workspace 名>
EOF
cat > /tmp/ws-iso-b/.siyuan-cli.yaml <<EOF
schemaVersion: 1
workspace: <你的第二个 workspace 名>
EOF

cd /tmp/ws-iso-a && node <repo>/dist/cli.mjs workspace which
# source: "project-file", workspace: <A>

cd /tmp/ws-iso-b && node <repo>/dist/cli.mjs workspace which
# source: "project-file", workspace: <B>

# 关键：两个 cwd 并发执行不串话
```

### Phase 2 — 拒绝字段硬错

```bash
cat > /tmp/ws-iso-a/.siyuan-cli.yaml <<EOF
schemaVersion: 1
token: secret-should-not-be-here
EOF
cd /tmp/ws-iso-a && node <repo>/dist/cli.mjs workspace which
# 应退出码 2，stderr 出 PROJECT_CONFIG_REJECTED_FIELD
```

### Phase 2 — workspace 不存在硬错

```bash
cat > /tmp/ws-iso-a/.siyuan-cli.yaml <<EOF
schemaVersion: 1
workspace: totally-not-a-real-workspace-xyz
EOF
cd /tmp/ws-iso-a && node <repo>/dist/cli.mjs workspace which
# 应退出码 2，stderr 出 PROJECT_CONFIG_WORKSPACE_NOT_FOUND
```

### Phase 2 — permission 覆盖

```bash
cat > /tmp/ws-iso-a/.siyuan-cli.yaml <<EOF
schemaVersion: 1
workspace: <你的 workspace>
permission:
  endpoints:
    deny:
      - query.sql
EOF

cd /tmp/ws-iso-a && node <repo>/dist/cli.mjs api query.sql "SELECT 1"
# 应退出码 5，stderr 出 ENDPOINT_DISABLED

cd /tmp && node <repo>/dist/cli.mjs api query.sql "SELECT 1" | head
# 同一 workspace，不同 cwd → 没有项目文件 → query.sql 正常执行
```

这最后一步是 P1 "cross-session workspace conflict" 核心场景的验证：**同一 workspace，两个 cwd，一个受项目文件 permission 约束，一个不受**。

## Rollback 策略

如果需要回滚：

- Phase 2 的所有改动（Patch 4, 5, 6, 7 后半, 9, 10, 11, 12, 13, 14）都可以一次性还原，不影响 Phase 1
- Phase 1（Patch 1, 2, 3, 8, 15 部分）相对独立，可单独保留
- Patch 7 前半（`cascadeWorkspacePermission` 重命名 + `resolveEffectivePermission` 新增）必须和 Patch 7 后半一起回滚

`git revert` 本 patch 对应的 commit 应该能一键还原所有内容。建议按 Phase 分两个 commit 提交，方便未来选择性回滚。

## 未做的事（明示）

- Phase 3（`extends:` / 别名机制）：按 Request 文档，观察 1-2 周真实使用后再决定
- `workspace show` 和 `workspace verify` 的 project-file 感知：故意不改，保持它们对全局 config 的纯粹性；如果用户要查 effective resolution，用 `workspace which`
- `siyuan workspace use --local`：Request 文档明确排除
- schemaVersion 升级路径：当前只支持 v1，未来升级时再设计

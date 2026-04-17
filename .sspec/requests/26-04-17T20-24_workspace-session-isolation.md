---
name: workspace-session-isolation
created: 2026-04-17T20:24:34
status: OPEN
attach-change: null
tldr: "CLI 全局 config.current 导致跨 session workspace 冲突；项目级 .siyuan-cli.yaml 可解决隔离问题"
---

# Request: workspace-session-isolation

## Background

siyuan-cli 通过 `~/.config/siyuan-cli/config.yaml` 中的 `current` 字段标记"当前活跃工作空间"。所有未显式指定 `--workspace` 的 CLI 调用都依赖此字段解析 workspace。

当前 workspace 解析优先级：
```
--workspace flag  >  $SIYUAN_CLI_WORKSPACE env  >  config.current (YAML 文件)
```

## Problem

### P1：跨 session workspace 冲突（严重，必须修）

`config.current` 是全局共享的可变状态——一个文件，任何进程写入都影响所有其他进程。`siyuan workspace use dev` 在命令名上完全看不出它会影响其他终端里正在跑的 agent——比 `npm install -g` 还糟，npm global 至少是声明式的。

事故场景：
```
Session A (Agent, 工作目录 /project-a/):
  当前 workspace = "prod"

Session B (Agent, 工作目录 /project-b/):
  siyuan workspace use dev     ← 改写了 config.yaml 的 current

Session A:
  siyuan api query.sql "..."  ← 静默打到了 dev，而非 prod
```

CLI 是 one-shot process，每次 `siyuan xxx` 都是新进程。以下方案都无法真正跨进程隔离：
- **PID lock 文件**：PID 每次不同，lock 无意义
- **env var**：`siyuan workspace use dev` 在子进程设 env，bash 退出即丢失；Agent 需主动设 `process.env` 才能传给子进程，CLI 无法控制
- **config.current**：全局共享，跨 session 冲突

### P2：同一 workspace 不同项目需要不同 permission（P1 的附带红利）

当前 permission 挂在 `config.workspaces[name].permission` 上。同一个 workspace "prod"，项目 A 只读、项目 B 读写——全局 config 只有一份 permission，无法区分。

不过这不一定是独立驱动需求。用户如果心智模型是"workspace = 权限 profile"，他们自然会创建 `prod-readonly` 和 `prod-readwrite` 两个 workspace 指向同一 baseUrl/token，P2 就不存在了。P2 是 P1 解决方案的附带收益，不值得单独为之引入机制。

### P3：permission 中 notebooks/paths 字段的填写指引缺失

`src/core/permission.ts` 中 `checkDeny` 对 notebooks 字段使用 `includes()` 精确匹配。代码本身没有 bug——`item.notebook` 在 extractor 里取的是 `box` 字段，即 notebook ID，`includes()` 精确匹配对 ID 是正确的。

**真正的 bug 是文档/教育缺失**：用户看 `notebooks.deny: ["..."]` 不知道里面该填什么。如果填了 hpath 如 `"/私人/日记"`，运行时 `item.notebook` 是 ID 如 `20260101215354-j0c5gvk`，永远匹配不上——静默失效，比报错更危险。

`paths.deny/allow` 用了 `micromatch.isMatch` glob，同样存在 hpath vs ID-based path 的混淆风险。`/思源笔记开发/**` 和 `/20260107143325-zbrtqup/**` 都能写，但前者永远不会命中 extractor 提供的 ID-based `path`。

## Chosen Direction: `.siyuan-cli.yaml` 项目级配置文件

经过对比（见下方已否决方案），选择方向 A，并附加若干收紧条件。

### 文件格式

```yaml
# .siyuan-cli.yaml — project-level siyuan-cli config
workspace: prod

permission:
  guardWrite: true
  api:
    disabled:
      - "block.delete*"
  content:
    notebooks:
      allow: ["20260101215354-j0c5gvk"]    # notebook ID
    paths:
      deny: ["/20260107143325-zbrtqup/**"]  # ID-based path glob
```

### 解析优先级

```
--workspace flag
  > $SIYUAN_CLI_WORKSPACE env
  > .siyuan-cli.yaml (从 cwd 向上查找，第一个命中即用)
  > config.current (使用时，如是写操作则 stderr warning)
```

### 收紧条件

1. **查找边界**：从 cwd 向上找 `.siyuan-cli.yaml`，第一个命中即停，不合并多层。**不读 `$HOME/.siyuan-cli.yaml`**——与 `~/.config/siyuan-cli/config.yaml` 语义重合，强制走 XDG 路径。到达 filesystem root 仍未找到则 fallback 到 `config.current`。

2. **permission 合并策略：两层 override，不是三层**。

   项目级 `.siyuan-cli.yaml` 的 permission **完全替换** 本次调用的 effective permission，不与 workspace 级 permission 合并。生效规则：
   - 存在项目级 permission → 项目级完全生效，忽略 workspace 级和 global defaults
   - 不存在项目级 permission → fallback 到 `config.workspaces[name].permission`，再 fallback 到 `config.defaults.permission`

   理由：三层 override（global default → workspace → project）在调试权限规则时极难推理。"为什么这条规则没生效"的答案应该只有最多两个可能的地方，不是三个。

3. **token 字段硬报错**：如果 `.siyuan-cli.yaml` 中出现 `token` / `tokenSource` / `baseUrl` 字段，CLI 立即报错 `PROJECT_CONFIG_REJECTED_FIELD`，提示该字段只能写在全局 config。**不静默忽略**——静默忽略会让用户误以为 token 生效了，实际走的是全局 config 或 env 的值。

4. **workspace 指向未注册名字 → 硬报错**：项目级文件中 `workspace: foo`，但 `config.workspaces` 里没有 `foo` → 报错 `WORKSPACE_NOT_FOUND`，提示先 `siyuan workspace add <name>`。**不 fallback 到 config.current**——fallback 会破坏隔离。

5. **不加 `siyuan workspace use --local` 命令**：用户手写 YAML 文件足够简单。过早加 CLI 入口会制造 edge case（在无 `.siyuan-cli.yaml` 的目录执行 `workspace use --local` 是创建还是报错？文件已存在时 workspace 字段和 permission 字段怎么局部更新？）。等有用户反馈再考虑。

### `config.current` 去留

**保留，降级为兜底默认**。用户第一次 `siyuan workspace add main` 后，在没有 `.siyuan-cli.yaml` 的目录跑 `siyuan api system.version` 应该能直接工作。强制每个目录都有项目级文件或 env 就是方向 C 的错误。

### 写操作审计 warning

无论 workspace 来源如何，当执行 write/mutation 操作且 workspace 解析来源是 `config.current`（最低优先级）时，向 stderr 输出：

```json
{"warning":"IMPLICIT_WORKSPACE","workspace":"prod","source":"config.current","message":"Workspace resolved from global default. Pass --workspace or add .siyuan-cli.yaml to avoid cross-session errors."}
```

不阻断，留 audit trail。

---

## 已否决的方案

### 方向 B：`.siyuan-workspace` 单行文件

只存 workspace name 一行。极简但无法解决 P2，且与全局 YAML 格式不统一。如果只冲 P1 去够用，但既然要引入新文件格式，多做一步到方向 A 的增量很小——前者是写 `prod` 一行，后者是写 `workspace: prod` 一行，成本几乎相同。

### 方向 C：取消 `config.current`，强制显式

要求每次调用必须 `--workspace` 或 env。对 agent 灾难——skill 里每个命令都要带 `--workspace`，sample 代码和文档翻三倍，agent 越被逼显式传参越容易遗漏。否决。

### 方向 D：项目级文件 + env 双保险

方向 A 的优先级链中 env 已经高于文件，Agent skill 文档中强调 env 可用即可。D 不是独立方向，是 A 的实施细节。

---

## P3 修复计划

P3 独立于上述方向，与 P1 实现解耦，可先行修复。

1. **文档修复**：`src/docs/` 下明确说明 `notebooks.{allow,deny}` 填 notebook ID、`paths.{allow,deny}` 填 ID-based path 或其 glob。写上反例（"不要填 hpath"）。schema description 里也加一行。

2. **permission 规则 load 时 smoke-test warning**：deny/allow 列表里如果出现看起来像 hpath 的字符串（含非 ASCII、含 `/` 但没有 ID 格式前缀），加载时 stderr warning——不阻塞，提示"你可能填的是 hpath 而不是 ID"。这比正则强制拒绝温和：用户意图可能合法（未来可能支持按名字 match），先 warning，硬拒绝留给后续决策。

3. **不用正则拒绝非 ID 规则**：过于刚性。用户填人类可读 notebook 名称可能是合理的未来需求，现在封死会限制演进空间。warning 足够。

## Success Criteria

1. 两个不同工作目录下的 CLI session 可以同时使用不同 workspace，互不干扰
2. 同一 workspace 可在不同项目目录下应用不同 permission 规则（项目级完全替换）
3. 现有 `--workspace` flag 和 `$SIYUAN_CLI_WORKSPACE` 用法不受影响
4. `config.current` 保留为兜底默认，write 操作使用时 emit warning
5. 项目级文件中 token 等敏感字段 → 硬报错
6. 项目级文件中 workspace 指向未注册名字 → 硬报错
7. permission 中 notebooks/paths 字段有清晰的 ID 填写指引 + smoke-test warning
8. Agent Skill 模板更新，推荐项目级配置机制

## Relational Context

- 现有权限系统（`src/core/permission.ts`）按 workspace name 加载规则，workspace 解析正确是权限生效的前提
- `src/docs/document-tree-and-paths.md`：明确指出 id 和 path 用于自动化/权限，hpath 用于人类可读
- 全局 config 格式参考 `src/core/config.ts` 中的 `AppConfig` 类型
- Agent 场景：pi / Claude Code 等，每次 CLI 调用是 `child_process.exec()` → one-shot 新进程
- `.gitignore` 策略：项目级配置建议纳入 git（团队共享安全规则），但需防 token 泄露

## Phasing

- **Phase 1**（先行，不依赖 P1 修复）：P3 文档修复 + smoke-test warning + 写操作 implicit-workspace warning
- **Phase 2**（核心）：引入 `.siyuan-cli.yaml`，含上述 5 条收紧条件
- **Phase 3**（观察期后决定）：notebook ID 别名映射（如 `prod-notebook: "20260101215354-j0c5gvk"`）——暂不做，ID 虽丑但稳定且唯一，真有用户反馈可读性痛点再加

---

## @AGENT
Adhere to the SSPEC protocol specifications and commence development from the current Request file.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILL + `sspec change new --from <this>`.

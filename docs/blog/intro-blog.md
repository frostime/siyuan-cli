# siyuan-cli：给外部 Agent 用的思源命令行工具

前段时间群里在热议「Obsidian 推出 CLI」的话题时，我随口评价了一嘴「OB 这么干是为了弥补没有思源这种内核 API 给外部调用的缺陷」，还被加精了。

不过话这么说，我后面仔细想了一下，还是觉得 CLI 有其存在的必要性。

Kernel API 对人类开发者固然友好，但是对 Agent 场景还是缺少了些必要的要点。

---

为了能让外部 Agent（Codex、OpenCode 之类）更顺手地操作思源，我写了 [`@frostime/siyuan-cli`](https://github.com/frostime/siyuan-cli)。这个项目发布到了 npm（GPL-3.0），当前 v0.7，算 alpha 级别。不保证稳定性也不对任何尝鲜者负责。

```bash
npm install -g @frostime/siyuan-cli
```

这套 CLI 框架主要关注这几个问题：多 workspace 管理、访问控制、统一的声明式接口，以及一套面向 Agent 的内置文档。下面挨个说。

---

## Workspace：在无状态的 CLI 里延续连接状态

无状态 CLI 有个固有的麻烦：每次调用都是一次白板，不记得上次连的是哪个思源、用的是哪个 token。对人类来说还好，敲几个参数的事；但 Agent 要面对的是「我当前应该操作哪个思源实例」这个每次都要重新解决的问题。

`siyuan-cli` 用命名 workspace 解决这个问题。连接信息注册一次，后续靠名字引用：

```bash
siyuan workspace add local  --url http://127.0.0.1:6806 --token <token>
siyuan workspace add remote --url http://192.168.1.100:6806 --token <token>
siyuan workspace verify local   # 测试连通性和认证
```

全局配置存在 `~/.config/siyuan-cli/config.yaml`，跨会话持久。切换全局默认：

```bash
siyuan workspace use local
```

---

光有全局默认还不够——当有多个项目、每个项目对接不同的思源实例时，全局切换会互相干扰。我的解法是在项目根目录放一个 `.siyuan-cli.yaml`，把这个项目钉死到某个 workspace：

```yaml
schemaVersion: 1
workspace: remote
```

`.siyuan-cli.yaml` 会引用已经在全局配置里注册过的 workspace 名字。

实际解析时，CLI 会从当前目录向上查找 `.siyuan-cli.yaml`，找到第一个就用它。整个解析链是：

```
--workspace 参数 > $SIYUAN_CLI_WORKSPACE 环境变量 > .siyuan-cli.yaml > 全局默认
```

这样依赖：临时调试可以用参数覆盖，CI/CD 可以用环境变量，日常开发靠项目配置文件，都不需要互相干扰。

任何时候都可以用 `siyuan workspace which` 查看当前目录下的解析结果：

```json
{
  "workspace": "local",
  "source": "global-current",
  "baseUrl": "http://127.0.0.1:6806",
  "hasToken": true,
  "projectConfigPath": null,
  "permissionOverriddenByProject": false,
  "permission": {
    "default": "allow",
    "ruleCount": 5,
    "rules": [
      { "index": 0, "endpoint": "system.exit", "effect": "deny" }
    ]
  }
}
```

`source` 字段告诉你 workspace 是从哪一层解析来的。在写操作之前先跑一下 `workspace which`，是确认操作目标的基本前置动作。

---

## API：以声明式接口封装 HTTP 请求

思源目前暴露了 60+ 个公开 API endpoint。`siyuan-cli` 把它们全部注册为结构化子命令，每个都带参数校验、`--help` 说明、示例：

```bash
siyuan api list                          # 列出所有可用 endpoint
siyuan api list --group block            # 按 group 过滤
siyuan api query.sql --help              # 查参数说明和示例
```

为了便于扩展，apis 采用声明 Schema + 注册 Endpoint 的方式。比如这份声明

```ts
export const schema: EndpointSchema = {
    endpoint: '/api/block/updateBlock',
    summary: 'Update block content',
    payload: {
        type: 'object',
        required: ['dataType', 'data', 'id'],
        additionalProperties: false,
        properties: {
            dataType: {
                type: 'string',
                enum: ['markdown', 'dom'],
                default: 'markdown',
                description: 'Content type'
            },
            data: { type: 'string', description: 'New content' },
            id: {
                type: 'string',
                description: 'Block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'update'
    },
    cli: { allowSource: { data: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    }
};
```

就会被解析为 CLI:

```bash
❯❯❯ siyuan api block.updateBlock --help

Update block content

USAGE
  siyuan api block.updateBlock [--<field> <value>...]
  siyuan api block.updateBlock -j '<json>'
  siyuan api block.updateBlock -f <file>

ENDPOINT
  POST /api/block/updateBlock
  Tags: mode:write, surface:content, scope:single, operation:update, risk:elevated

PARAMETERS
  --dataType  <string>  required (default: "markdown")
        Content type
        Allowed: markdown | dom
  --data  <string>  required
        New content
  --id  <string>  required
        Block ID

INPUT SOURCES
  data: literal | file | stdin

PAYLOAD MODES
  -j, --json <json>   Pass JSON payload inline
  -f, --file <path>   Load JSON payload from file (- = stdin)

OUTPUT
  default: --print compact → stdout prints endpoint compact text or JSON fallback
  --print json: stdout prints raw result JSON
```

调用方式很直接，均按照 `siyuan api <group>.<endpoint> [args]` 的格式，常用字段可以直接传位置参数或具名 flag：

```bash
# 位置参数（primary field）
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"

# 具名 flag
siyuan api block.getBlockKramdown --id 20260425162235-pnpy21c

# 整体 JSON payload
siyuan api block.updateBlock -j '{"id":"...","data":"...","dataType":"markdown"}'

# 从文件读取（适合大段 Markdown 或 SQL）
siyuan api block.updateBlock --id <id> --data @file:./content.md --dataType markdown
```

为了方便大容量输入，部分 API 会声明 `allowSource`，例如 `block.updateBlock` 的 data 字段声明了 `file` 和 `stdin`，就可以用 `@file:./path`、`@stdin`  这种语法，从文件、STDIN 流中读取内容并 pipe 到 CLI 参数中，这在 Agent 调用时可以提高准确率，比如可以让 Agent Write Content 文件，再调用 bash。

输出格式通过 `--print` 控制；默认输出是 compact 格式；`--print json` 切换为原始内核响应：

```bash
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
```

```
5 rows [hpath, id]
1: /重构 misc model provider | 20251111144823-0lhpmav
2: /智能体实验方案设计 | 20260305172423-yswy868
3: /分享自用的 vscode prompt 组合插件 | 20251215223010-q4fpnj9
4: /Prompt | 优化项目本子内容 | 20260124162935-qf9u737
5: /未命名 | 20260313171416-tsqmopc
```

不过只有部分实现了 `format` 的 Endpoint Schema 才有 compact 输出。

写操作之前可以用 `--dry-run` 预览，不实际发出请求：

```bash
siyuan api block.deleteBlock --id 20260425162235-pnpy21c --dry-run
```

```json
{
  "dryRun": true,
  "endpoint": "/api/block/deleteBlock",
  "payload": { "id": "20260425162235-pnpy21c" },
  "wouldRequestApproval": false
}
```

`wouldRequestApproval: false` 表示当前 permission 配置对这个操作不会触发 User Approval (见下面)，实际执行会直接放行。`--debug` 则会把等价的 curl 命令打到 stderr，方便调试或验证请求构造是否正确。

错误输出全部走 stderr，stdout 保持干净，方便 Agent 直接 pipe 处理结果。

---

## Tool：高层组合操作

很多实际任务靠单次 API 调用完不了。最典型的例子：「往今天的日记里追加一段内容」。裸 API 的做法是：先调 `filetree.createDailyNote` 拿到今天日记的 id，再调 `block.appendBlock` 追加内容，中间还要处理日记不存在时的创建逻辑。

`tool` 子命令把这类组合流程封装成单条命令：

```bash
# 直接往某个笔记本的今日日记追加内容，CLI 处理创建和 id 解析
siyuan tool append-content \
  --targetId 20251229225047-4iukalq \
  --targetType dailynote \
  --markdown "## 今日记录\n这是追加的内容"

# 同样支持 --dry-run 预览
siyuan tool append-content \
  --targetId 20251229225047-4iukalq \
  --targetType dailynote \
  --markdown @file:./today.md \
  --dry-run
```

列出某个笔记本或文档下的文档树：

```bash
siyuan tool list-doc-tree --entry 20260319110807-40hbj5r --depth 2
```

```
❯❯❯ siyuan tool list-doc-tree --entry 20260319110807-40hbj5r  --depth 2
# Document tree: daily note

- 2026 (20260319110807-rpatefx)
  ├─ 03 (20260319110808-qvgecjr) (+3)
  └─ 04 (20260425162235-bxpakql) (+2)
```

按日期范围列出日记：

```bash
siyuan tool list-dailynote --afterDate 2026-04-01
```

```
# Daily Notes (5)
- [20260425162234-1m7mjs9] /daily note/2026/04/2026-04-25 (notebook: 20251229225047-4iukalq)
- [20260417194845-j6ju08u] /daily note/2026-04-17       (notebook: 20250416150019-rl4bcvz)
- [20260404034801-dfn1avz] /daily note/2026/04/2026-04-04 (notebook: 20220306104547-c7ilt3x)
...
```

读取文档或块的 Markdown 内容：

```bash
# 读前 30 个块，每个块前面带 id 标注
siyuan tool get-block-content <doc-id> --slice "0:30" --showId true

# 从某个已知块往后继续读 20 个块（翻页）
siyuan tool get-block-content <doc-id> --slice "<last-block-id>:+20"
```

路径解析——hpath 是人类可读的，但会随文档重命名而变化，稳定地址应该用 id-based path：

```bash
siyuan tool resolve-path --hpath "/private/diary"
siyuan tool resolve-path --id 20260417090223-xxxxxxx
```

查块元信息，对文档类型的块还会输出 TOC：

```bash
siyuan tool get-block-info 20260425162234-1m7mjs9
```

```
=== Block [20260425162234-1m7mjs9] ===
  type: d
  hpath: /daily note/2026/04/2026-04-25
  box: 20251229225047-4iukalq
  created: 20260425162234  updated: 20260425162235
  child blocks: 0
  TOC:
    - [20260425162235-pnpy21c] # Vibe Coding 完整指南
    - [20260425162235-q0c8e2f] ## 一、为什么你失败了
    - [20260425162235-t2r6exb] ## 二、文档优先系统
    ...
```

---

## 访问控制：细粒度 Permission Rule

让 Agent 自由操作自己的笔记是有风险的。思源的内核 API 包含了删除文档、关闭笔记本、甚至退出内核（`system.exit`）这类操作——你不会希望 Agent 在一次错误的工具调用里把这些都触发了。

`siyuan-cli` 在每个 workspace 上支持声明式的 permission rule，在请求发出到内核之前做拦截。规则写在配置里：

```yaml
workspaces:
  local:
    baseUrl: http://127.0.0.1:6806
    token: <token>
    permission:
      default: allow
      rules:
        # 彻底禁止退出内核
        - endpoint: "system.exit"
          effect: deny

        # 禁止对某个笔记本的所有操作
        - notebook: "20220305173526-4yjl33h"
          effect: deny

        # 禁止写入某个文档树下的所有路径
        - path: "/20260107143325-zbrtqup/**"
          action: write
          effect: deny

        # 所有其他 system.* 操作需要人工确认
        - endpoint: "system.*"
          effect: approval
```

规则字段支持按以下维度组合过滤：

- `endpoint`：API endpoint id，支持 glob（`system.*`、`block.get*`）
- `tool`：高层 tool id（`append-content`、`list-doc-tree`）
- `notebook`：笔记本 id，精确匹配
- `path`：思源文档的 ID-based path，支持 glob（`/20260107143325-zbrtqup/**`）
- `action`：操作类型，`read` / `write` / `invoke`

**执行顺序即优先级**，顶到底逐条匹配，第一条命中的规则生效，没有隐式的 deny-beats-allow。这意味着规则顺序很重要，需要显式地把更具体的规则放在前面。

`effect` 有三种：`deny` 是硬拦截、`allow` 是放行、`approval` 是暂停等待审批。

实际被拦截时的输出：

```
{"error":"ENDPOINT_DENIED","message":"endpoint \"system.exit\" denied: denied by rule #2"}
```

退出码 5 代表 permission denied，Agent 可以直接按退出码分支处理，不用解析 stderr 文本。

权限检查分两个阶段进行：Phase 1 在请求发出前只看 endpoint/tool/action，能立即判断的规则直接返回结果；Phase 2 在请求内容解析完成后，把 notebook、path 等上下文带入做完整匹配。这意味着权限控制可以精确到「某个笔记本下某棵文档树的写操作」这个粒度，不只是接口层面的拦截。

permission rule 也可以写在项目级的 `.siyuan-cli.yaml` 里，效果是覆盖 workspace 的 permission 配置，只对当前项目目录下的调用生效。

项目级和全局配置都支持 `behavior` 字段，控制审批和 `--yes` 的行为：

```yaml
behavior:
  allowYes: false           # 禁止 --yes 绕过审批
  approval:
    timeout: 120            # 审批超时秒数
    autoOpen: false         # 不自动打开浏览器
```

---

## User Approval：带 WebUI 的审批体验

前面提到 `effect: approval` 会暂停操作等人确认。`siyuan-cli` 给这个流程配了一套 WebUI，在终端弹审批提示的同时，自动起一个本地 broker，打开浏览器就能点 approve/reject。

默认 `--yes` 可以自动跳过审批（适合纯自动化场景），在 `behavior` 里关掉 `allowYes` 就能强制走 WebUI。

---

## 内置文档：Agent 的自我导航

这套 CLI 面向 Agent 场景的一个具体体现是：它随包附带了一套完整的参考文档，Agent 可以直接通过命令发现和阅读，不需要出去找外部资料。

```bash
siyuan doc list          # 列出所有文档，输出 relPath、absPath、summary
siyuan doc read README.md
siyuan doc read recipes/edit-content.md
```

文档分三层：

**思源领域知识**（`siyuan-guide/`）——block 数据模型、path vs hpath 的语义区别、SQL 五张表的查询策略、日记的路径模板规律。这些是 Agent 在操作思源时最容易踩坑的地方，靠这几篇文档可以少走很多弯路。

**CLI 用法参考**（`cli-usage/`）——完整命令树、全局 flag、输入源语法（`@file`/`@stdin`/`@env`）、权限配置格式、错误码说明。

**Recipes**（`recipes/`）——面向任务的操作流程。比如「安全地修改一个已有文档」：先 `workspace which` 确认目标、再 `get-block-info` 检查元信息、再 `get-block-content` 读内容确认目标正确、然后用 `--dry-run` 预览写操作、最后执行并读回验证。这些 recipe 是 Agent 在典型任务下的行动模板。

`siyuan --help` 和 `siyuan doc --help` 会直接打印 docs 根目录的真实磁盘路径，Agent 可以绕过 CLI 直接读文件，不必通过命令中转。

此外，`siyuan skill install` 可以把一个精简版的 SKILL.md 安装到 Agent 的配置目录（支持 `~/.agents`、`~/.claude`、`.pi` 等常见目录）。这个 SKILL 是 Agent 发现和上手 `siyuan-cli` 的入口文档——告诉 Agent 这个工具是干什么的、核心概念是什么、从哪里开始读。

```bash
siyuan skill install                    # 安装到 ~/.agents/skills/
siyuan skill install --target claude    # 安装到 ~/.claude/skills/
siyuan skill install --target .pi --local  # 安装到当前项目的 .pi/ 目录
```

`skill` 也提供 `skill read`（查看内置 SKILL 内容）和 `skill uninstall`（卸载）。

---

## 扩展

目前内置覆盖了思源公开 API 文档里的全部 endpoint，以及上面列出的几个高层 tool。

架构上，所有 endpoint 和 tool 都是声明式注册的——每个 endpoint 对应一个 schema 文件，描述 payload 结构、分类（read/write、content/workspace/runtime）、guard 规则、compact 输出格式；tool 同理。

这套架构的优点在于松耦合，方便扩展。加一个 endpoint 就是在对应目录下新增一个文件，注册进 index，不需要动框架本身。
所以后面还打算引入用户自定义扩展，允许在不修改源码的情况下挂载自己需要的 endpoint 和 tool，通过同一套接口统一调用。

---

GPL-3.0 开源：https://github.com/frostime/siyuan-cli

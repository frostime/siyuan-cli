# siyuan-cli：让外部 Agent 操作思源的命令行工具

前段时间群里聊到「Obsidian 推出 CLI」的话题，我当时的看法是：OB 这么做是为了弥补没有思源这种内核 API 可以直接调用的缺陷。

这个看法现在还是对的——思源的 Kernel API 确实是一个很大的优势。但后来我在实际给 Agent 用的时候发现，光有 HTTP API 还不够。

Agent 不是人类开发者。你让 Claude Code 或 Codex 去调思源 API，它需要解决一连串基础问题：连接信息从哪来？token 放哪？当前要操作哪个思源实例？这个操作会不会把我的笔记搞坏？有哪些 API 可以用、参数是什么？每一个问题单独看都不大，但 Agent 每次会话都要重新面对，累积起来就很容易出错。

所以我写了 [`@frostime/siyuan-cli`](https://github.com/frostime/siyuan-cli)，一个面向外部 Agent 场景的思源命令行工具。

```bash
npm install -g @frostime/siyuan-cli
```

当前 v0.11，Alpha 阶段，不保证稳定性。GPL-3.0 开源。下面介绍一下它做了什么。

---

## 先看用起来什么感觉

注册一个 workspace，查个文档列表：

```bash
siyuan workspace add local --url http://127.0.0.1:6806 --token <token>
siyuan workspace verify local
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
```

输出：

```
5 rows [hpath, id]
1: /重构 misc model provider | 20251111144823-0lhpmav
2: /智能体实验方案设计 | 20260305172423-yswy868
3: /分享自用的 vscode prompt 组合插件 | 20251215223010-q4fpnj9
4: /Prompt | 优化项目本子内容 | 20260124162935-qf9u737
5: /未命名 | 20260313171416-tsqmopc
```

往日记里追加一段内容：

```bash
siyuan tool append-content \
  --targetId <notebook-id> --targetType dailynote \
  --markdown "## 今日记录\n测试一下 CLI"
```

看某个文档的结构：

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

这就是 siyuan-cli 的基本使用体感——不需要自己拼 HTTP 请求，一条命令带上参数直接调用，输出是人和 Agent 都能处理的格式。

---

## Workspace：连接管理

CLI 每次调用都是无状态的，不记得上次连的是哪个思源。对人来说敲几个参数的事，但 Agent 每次都要重新解决「我该连哪个」的问题。

`siyuan-cli` 用命名 workspace 解决这件事。连接信息注册一次，后续靠名字引用，配置持久化在 `~/.config/siyuan-cli/config.yaml`。

```bash
siyuan workspace add local  --url http://127.0.0.1:6806 --token <token>
siyuan workspace add remote --url http://192.168.1.100:6806 --token <token>
siyuan workspace use local       # 设为全局默认
```

不知道端口的话，可以用工作空间目录自动发现：

```bash
siyuan workspace add dev --workspace-dir /path/to/SiYuanDevSpace --token <token>
```

多项目场景下，全局默认会互相干扰。在项目根目录放一个 `.siyuan-cli.yaml` 就能把项目钉死到某个 workspace：

```yaml
schemaVersion: 1
workspace: remote
```

这个文件可以安全提交到 Git——CLI 不允许在里面放 token 或 URL。

解析优先级：`--workspace` 参数 > `$SIYUAN_CLI_WORKSPACE` 环境变量 > `.siyuan-cli.yaml` > 全局默认。临时调试用参数覆盖，CI/CD 用环境变量，日常靠配置文件，各不干扰。

任何时候用 `siyuan workspace which` 就能看到当前目录下解析到了哪个 workspace、从哪一层解析来的、权限规则是什么。写操作之前跑一下这个命令是个好习惯。

---

## API：思源内核 API 的结构化封装

思源目前暴露了 60+ 个公开 API endpoint。`siyuan-cli` 把它们全部注册为结构化子命令，每个 endpoint 都有参数校验、`--help` 说明。

```bash
siyuan api list                           # 列出所有可用 endpoint
siyuan api list --group block             # 按 group 过滤
siyuan api block.updateBlock --help       # 查看参数说明
```

<!-- 截图：siyuan api block.updateBlock --help 的终端输出 -->

调用方式灵活，位置参数、具名 flag、JSON payload 随你选：

```bash
# 位置参数——SQL 查询最常用
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"

# 具名 flag
siyuan api block.getBlockKramdown --id 20260425162235-pnpy21c

# 整体 JSON payload
siyuan api block.updateBlock -j '{"id":"...","data":"new content","dataType":"markdown"}'
```

### @file / @stdin：大段内容不用塞命令行

很多写操作需要传入大段 Markdown，直接在命令行里拼容易出问题（转义、长度限制）。支持 `@file:` 和 `@stdin` 语法的字段可以从文件或管道读取内容：

```bash
# 从文件读内容写入块
siyuan api block.updateBlock --id <id> --data @file:./content.md --dataType markdown

# 从管道读 SQL
echo "SELECT id FROM blocks WHERE type='d' LIMIT 3" | siyuan api query.sql @stdin
```

哪些字段支持哪些输入源，`--help` 里的 INPUT SOURCES 部分会列出来。

这个设计对 Agent 特别有用——Agent 可以先把内容写到临时文件，再通过 `@file:` 传入 CLI，完全绕过 shell 转义问题。

### 写操作安全：dry-run 和 debug

```bash
# 预览写操作，不实际发请求
siyuan api block.deleteBlock --id <id> --dry-run
```

```json
{
  "dryRun": true,
  "endpoint": "/api/block/deleteBlock",
  "payload": { "id": "20260425162235-pnpy21c" },
  "wouldRequestApproval": false
}
```

`wouldRequestApproval` 告诉你当前权限配置会不会触发人工审批（下面会讲）。`--debug` 会把等价的 curl 命令打到 stderr，方便调试。

错误输出全部走 stderr，stdout 保持干净，Agent 可以直接 pipe 处理结果。

---

## Tool：高层组合操作

很多实际任务靠单次 API 调用完不了。典型的例子：「往今天的日记里追加一段内容」。裸 API 需要先 `createDailyNote` 拿到 id，再 `appendBlock` 追加内容，中间还要处理日记不存在时的创建。

Tool 把这类多步流程封装成一条命令：

```bash
# 往今日日记追加内容，CLI 内部处理创建和 id 解析
siyuan tool append-content \
  --targetId <notebook-id> --targetType dailynote \
  --markdown @file:./today.md
```

其他几个常用的 tool：

```bash
# 文档树
siyuan tool list-doc-tree --entry <notebook-id> --depth 2
```

```
# Document tree: daily note
- 2026 (20260319110807-rpatefx)
  ├─ 03 (20260319110808-qvgecjr) (+3)
  └─ 04 (20260425162235-bxpakql) (+2)
```

```bash
# 按日期范围列出日记
siyuan tool list-dailynote --afterDate 2026-04-01

# 读取文档内容，支持分页
siyuan tool get-block-content <doc-id> --slice "0:30" --showId true
# 从某个块往后继续读（翻页）
siyuan tool get-block-content <doc-id> --slice "<last-block-id>:+20"

# 路径解析——hpath 到 id
siyuan tool resolve-path --hpath "/private/diary"

# 把本地 md 文件导入思源（内核自动处理图片、链接转换）
siyuan tool push-md ./article.md --notebook <id> --toPath "/inbox"
```

完整列表用 `siyuan tool list` 查看，每个 tool 都支持 `--help` 和 `--dry-run`。

---

## 访问控制：让 Agent 操作笔记不用提心吊胆

这可能是整个 CLI 里我花心思最多的部分。

思源的内核 API 包含了删除文档、关闭笔记本、甚至退出内核（`system.exit`）这类操作。你不会希望 Agent 在一次失误的工具调用里把这些都触发了。`siyuan-cli` 在请求发出到内核之前做拦截，用声明式的 YAML 规则控制。

```yaml
permission:
  default: allow
  rules:
    # 彻底禁止退出内核
    - endpoint: "system.exit"
      effect: deny

    # 禁止写入某棵文档树
    - path: "/20260107143325-zbrtqup/**"
      action: write
      effect: deny

    # 禁止访问某个笔记本
    - notebook: "20220305173526-4yjl33h"
      effect: deny

    # 所有 system.* 操作需要人工审批
    - endpoint: "system.*"
      effect: approval
```

规则支持按 endpoint（glob 匹配）、notebook、id-based path、action（read/write/invoke）组合过滤。自上而下匹配，第一条命中的规则生效。

三种 effect：`deny` 是硬拦截，`allow` 是放行，`approval` 是暂停等人确认。

### 不只是拦截请求

权限控制不只在「能不能调这个 API」这一层。

`query.sql` 这类全局查询 API 会返回所有笔记本的结果。如果你用规则禁止了访问笔记本 B，CLI 不是简单地拦截查询请求（那样什么都查不了），而是**在拿到内核返回的结果后，自动过滤掉笔记本 B 的行**，只让你看到有权限的数据。

这个过滤逻辑是声明式的——每个 endpoint schema 里声明了返回数据的结构（哪个字段是 notebook id、哪个是 path），权限引擎根据这些信息自动过滤，不需要手动处理。

### 风险自动标记

权限规则之外，CLI 还根据每个 endpoint 的分类（读/写、单条/批量、内容/系统级）自动推导风险等级。批量删除、系统级写操作这类高风险操作，即使权限规则放行了，也会自动触发人工审批。

这层保护独立于用户配置的规则，相当于一个兜底的安全网。

### 审批中心

触发 `approval` 的操作会自动启动一个本地 broker，在浏览器里打开审批页面。操作详情一目了然，点 Approve 或 Reject 就行。

<!-- 截图：Approval Center 审批界面 -->
![Approval Center](assets/approval-center.png)

也可以纯终端操作：`siyuan approval list` 查看待审批列表，`siyuan approval approve <id>` 直接放行。

纯自动化场景可以用 `--yes` 跳过审批，也可以在配置里设 `behavior.allowYes: false` 强制走审批流程。

---

## 内置文档：Agent 的自我导航

这个 CLI 面向 Agent 场景的一个具体体现是：它自带一套完整的参考文档，Agent 可以直接通过命令发现和阅读。

```bash
siyuan doc list                          # 列出所有文档
siyuan doc read recipes/edit-content.md  # 读某篇操作 recipe
```

文档分三层：

**思源领域知识**（`siyuan-guide/`）——block 数据模型、path 和 hpath 的区别、SQL 五张表的查询策略、日记的路径规律。这些是 Agent 操作思源时最容易踩坑的地方。

**CLI 用法参考**（`cli-usage/`）——完整命令树、全局 flag、权限配置格式、错误码说明。

**操作 Recipes**（`recipes/`）——面向任务的标准流程。比如「安全地编辑一个已有文档」：先 `workspace which` 确认目标 → `get-block-info` 检查元信息 → `get-block-content` 读内容确认 → `--dry-run` 预览写操作 → 执行 → 读回验证。

此外，`siyuan skill install` 可以把一个精简的 SKILL 文件安装到 Agent 的配置目录（支持 `~/.claude`、`~/.agents` 等），让 Agent 在需要操作思源时自动发现这个工具。

```bash
siyuan skill install                    # 安装到 ~/.agents/skills/
siyuan skill install --target claude    # 安装到 ~/.claude/skills/
```

---

## 用户扩展

上一版博客里这部分还只是「打算做」，现在已经实现了。

在 `~/.config/siyuan-cli/extensions/` 下用 TypeScript 写自定义 endpoint 和 tool，CLI 运行时自动加载，和内置命令享受同一套接口：参数校验、`--help`、`--dry-run`、权限检查。

```bash
siyuan extension init          # 初始化扩展目录，生成 tsconfig.json
siyuan extension cache         # 生成 schema 缓存
siyuan extension list          # 查看已加载的扩展
```

比如写一个自定义的 tool，放在 `extensions/tools/hello.ts`：

```ts
import type { ToolSchema } from "@frostime/siyuan-cli/schema";

export const tool: ToolSchema = {
  id: "hello-ext",
  summary: "Greet someone",
  input: {
    type: "object",
    properties: { name: { type: "string", description: "Name" } }
  },
  async run(ctx, input) {
    const { name = "world" } = input as { name?: string };
    // ctx.callEndpoint() 可以调用已注册的内核 API，带权限检查
    return { content: `Hello, ${name}!` };
  }
};
```

```bash
siyuan extension cache
siyuan tool hello-ext --name Alice
# → Hello, Alice!
```

API extension 同理，`export const schema: EndpointSchema = { ... }` 就行。具体写法见 `siyuan doc read cli-usage/extension`。

---

## 怎么上手

最简路径：

```bash
# 安装
npm install -g @frostime/siyuan-cli

# 连接你的思源
siyuan workspace add local --url http://127.0.0.1:6806 --token <token>
siyuan workspace verify local

# 试几个命令
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
siyuan tool list-doc-tree --notebook <notebook-id>

# 给你的 Agent 装上 skill
siyuan skill install --target claude
```

装好 skill 之后，Agent 会自动知道怎么用这个 CLI——它会读内置文档，了解思源的数据模型，按 recipe 操作。你不需要记住每个命令的参数。

如果你想限制 Agent 能做什么，在 `~/.config/siyuan-cli/config.yaml` 的 workspace 下加 `permission.rules` 就行。最低限度建议至少加上：

```yaml
permission:
  default: allow
  rules:
    - endpoint: "system.exit"
      effect: deny
```

其他具体用法 CLI 自带的文档覆盖得比较全，`siyuan doc list` 可以看到所有可读的文档。

---

Alpha 阶段，接口可能还会调整，不保证向前兼容。有问题或想法欢迎到 GitHub 提 issue。

GPL-3.0 开源，要求 Node.js ≥ 20。

GitHub：https://github.com/frostime/siyuan-cli

npm：`npm install -g @frostime/siyuan-cli`

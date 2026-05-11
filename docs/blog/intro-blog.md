# siyuan-cli：让外部 Agent 操作思源的命令行工具

前段时间群里聊到「Obsidian 推出 CLI」的话题，我当时的看法是：OB 这么做是为了弥补没有思源这种内核 API 可以直接调用的缺陷。

这个看法现在还是对的——思源的 Kernel API 确实是一个很大的优势。但后来我在实际给 Agent 用的时候发现，光有 HTTP API 还不够。

Agent 不是人类开发者。你让 Claude Code 或 Codex 去调思源 API，它需要解决一连串基础问题：连接信息从哪来？token 放哪？当前要操作哪个思源实例？这个操作会不会把我的笔记搞坏？有哪些 API 可以用、参数是什么？每一个问题单独看都不大，但 Agent 每次会话都要重新面对，累积起来就很容易出错。

所以我写了 [`@frostime/siyuan-cli`](https://github.com/frostime/siyuan-cli)，一个面向外部 Agent 场景的思源命令行工具。

```bash
npm install -g @frostime/siyuan-cli
```

当前 v0.13，Beta 阶段，不保证向前兼容。GPL-3.0 开源。

---

## 适合谁用

siyuan-cli 的前提条件是：你使用的 Agent 工具**具备 bash / 终端访问能力**。目前典型的场景包括 Claude Code、Codex、OpenCode、Cowork 这类工具——它们可以直接在终端执行命令、读写文件、观察输出。siyuan-cli 就是为这个能力模型设计的：Agent 通过 bash 调用 CLI，CLI 负责跟思源内核通信。

如果你的 Agent 工具只能通过 MCP 调用预定义的工具函数，那它和 siyuan-cli 的集成方式不太一样。siyuan-cli 不是一个 MCP server，它是一个命令行程序——更底层，也更灵活，后面会解释这个定位。

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

列出某个笔记本的文档树：

```bash
siyuan tool list-doc-tree --entry <notebook-id> --depth 2
```

```
# Document tree: daily note
- 2026 (20260319110807-rpatefx)
  ├─ 03 (20260319110808-qvgecjr) (+3)
  └─ 04 (20260425162235-bxpakql) (+2)
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

不需要自己拼 HTTP 请求，一条命令带上参数直接调用，输出是人和 Agent 都能处理的格式。

---

## 两层命令：API 和 Tool

siyuan-cli 里操作思源的命令分两层。

第一层是 `siyuan api`。思源目前暴露了 60 多个公开 API endpoint，siyuan-cli 把它们全部注册为结构化子命令。每个 endpoint 都有参数校验和 `--help` 说明，调用时不需要记内核的 HTTP 路径和请求格式——endpoint 以 `<group>.<name>` 的形式组织，比如 `query.sql`、`block.updateBlock`、`filetree.searchDocs`。

```bash
siyuan api list                        # 列出所有可用 endpoint
siyuan api list --group block          # 按 group 过滤
siyuan api block.updateBlock --help    # 查看参数说明

# 位置参数——SQL 查询最常用
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"

# 具名 flag
siyuan api block.getBlockKramdown --id 20260425162235-pnpy21c

# 往今天的日记追加内容
siyuan api block.appendDailyNoteBlock --notebook <id> --data "## 今日记录" --dataType markdown
```

样例:
```
>> siyuan api block.appendDailyNoteBlock --help
Append blocks to today's daily note

USAGE
  siyuan api block.appendDailyNoteBlock [--<field> <value>...]
  siyuan api block.appendDailyNoteBlock -j '<json>'
  siyuan api block.appendDailyNoteBlock -f <file>

ENDPOINT
  POST /api/block/appendDailyNoteBlock
  Tags: mode:write, surface:content, scope:single, operation:create, risk:elevated

PARAMETERS
  --notebook  <string>  required
        Notebook ID
  --data  <string>  required
        Content to append
  --dataType  <string>  required (default: "markdown")
        Content type; use markdown by default
        Allowed: markdown | dom

INPUT SOURCES
  data: literal | file | stdin

PAYLOAD MODES
  -j, --json <json>   Pass JSON payload inline
  -f, --file <path>   Load JSON payload from file (- = stdin)

OUTPUT
  default: --print compact → stdout prints endpoint compact text or JSON fallback
  --print json: stdout prints { ok, data, extra } envelope JSON
```

第二层是 `siyuan tool`。很多实际任务靠单次 API 调不了、或者只靠 API 会存在一些边界风险、抑或着需要过滤组织有效信息。而很多操作都涉及多步 API 编排或结果整理。Tool 把这类流程封装成一条命令，内部自己处理。上面演示里的 `list-doc-tree`、`get-block-info` 都是内置 tool。

```bash
siyuan tool list                                    # 查看所有可用 tool
siyuan tool get-block-content <doc-id> --slice "0:30" # 读文档内容，按块分页
siyuan tool push-md ./article.md --notebook <id> --toPath "/inbox"  # 导入本地 md
```

两层的关系是：api 是对内核 endpoint 的一对一映射，tool 是在 api 之上的组合编排。它们共享同一套全局机制——workspace 解析、权限检查、`--dry-run` 预览、`--help` 文档。

### 一些对 Agent 友好的设计

写操作经常需要传入大段 Markdown。直接在命令行里拼长字符串容易出问题（转义、长度限制），所以 CLI 支持 `@file:` 和 `@stdin` 语法：Agent 可以先把内容写到临时文件，再通过 `@file:` 传给 CLI，完全绕过 shell 转义。

```bash
# 从文件读内容写入块
siyuan api block.updateBlock --id <id> --data @file:./content.md --dataType markdown

# 从 stdin 读——配合 heredoc 写多行内容很方便
siyuan tool append-content --targetId <id> --targetType document --markdown @stdin <<'EOF'
## 新的章节

这里是正文内容。
EOF
```

输出方面，默认是紧凑的人类可读格式，加 `--print json` 切换为结构化 JSON 信封，方便 Agent 程序化解析：

```bash
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 3" --print json
```

```json
{
  "ok": true,
  "data": [
    { "hpath": "/daily note/2024-04", "id": "20240401175210-c2iabsn" },
    { "hpath": "/daily note/2024-10", "id": "20241002152609-w6xsu78" },
    { "hpath": "/daily note/2024-01", "id": "20240113205839-st4q3ps" }
  ],
  "extra": { "warnings": [], "notices": [] }
}
```

写操作都支持 `--dry-run`，预览要发什么请求而不实际执行。这对 Agent 场景很重要——先看看要做什么，确认没问题再真正跑：

```bash
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

`wouldRequestApproval` 告诉你当前权限配置下这个操作会不会触发人工审批。`--debug` 会把等价的 curl 命令输出到 stderr，方便排查请求细节：

```bash
siyuan api query.sql "SELECT id FROM blocks LIMIT 1" --debug
# stderr → {"debug":{"curl":"curl -X POST http://127.0.0.1:6806/api/query/sql ..."}}
```

错误输出全部走 stderr，stdout 保持干净，Agent 可以直接 pipe 处理结果。

---

## 定位：服务于工作流的「基础设施」

作为对比 MCP 封装的是一套固定的工具函数，Agent 按照 server 提供的接口来用。这对于标准化场景很方便，但也意味着很难跳出 server 预设的操作范围。siyuan-cli 的定位不一样——它是一个**底层基础设施**，提供思源内核 API 的完整命令行访问、连接管理、权限控制、Agent 自我导航文档，但**不替你决定工作流**，强调的是一个可用的基座 + 可扩展性。

推荐的用法是：安装 siyuan-cli 作为基座，然后结合自己的日常工作流，创建属于你自己的 Agent SKILL。

举几个例子。你在做某个项目，思源里有一个专门的笔记本，你可以写一个 SKILL 告诉 Agent：只操作这个笔记本，新内容追加到日记，重要结论同步到项目文档——Agent 基于 siyuan-cli 执行，但工作流逻辑在你的 SKILL 里。或者你想让 Agent 搜索笔记库回答问题，SKILL 里定义搜索策略和结果范围，siyuan-cli 负责实际的查询和内容读取。再比如积累了很多未整理的笔记要批量归档，SKILL 里写分类规则和目标结构，siyuan-cli 负责移动文档、修改属性。

这些场景里，siyuan-cli 是不变的基座，变化的是你的 SKILL——它编码了你的偏好、你的笔记组织方式、你对 Agent 的信任边界。siyuan-cli 管「怎么安全地操作思源」，你的 SKILL 管「让 Agent 做什么」。

---

## 访问控制

思源的内核 API 包含了删除文档、关闭笔记本、甚至退出内核（`system.exit`）这类操作。你不会希望 Agent 在一次失误的工具调用里把这些都触发了。siyuan-cli 在请求发出到内核之前做拦截，你用声明式的规则来描述 Agent 能做什么、不能做什么：

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

    # 这个笔记本，Agent 完全不能碰
    - notebook: "20220305173526-4yjl33h"
      effect: deny

    # 所有系统级操作需要人工审批
    - endpoint: "system.*"
      effect: approval
```

规则支持按 endpoint、notebook、文档路径、操作类型组合过滤，自上而下匹配，第一条命中的规则生效。三种控制效果：`deny` 是硬拦截，Agent 直接被挡回来；`allow` 是放行；`approval` 是暂停执行，等你确认。

### 两层拦截：入口和出口

权限不只是「能不能调这个 API」。CLI 在请求的入口和出口都做检查。

**入口拦截（Payload Guard）**：写操作发出前，CLI 会解析请求里的 block ID / notebook ID，定位到它属于哪个笔记本、哪棵文档树，再和规则比对。命中 deny 的直接拦截，请求根本不会到达内核：

```bash
# 假设规则 deny 了笔记本 Test
siyuan api block.getBlockKramdown --id 20240416110608-8pr45e1
```

```json
{"error":"CONTENT_DENIED","message":"id \"20240416110608-8pr45e1\" (access: read) denied by rule #1"}
```

**出口过滤（Response Filter）**：`query.sql`、`notebook.lsNotebooks`、全文搜索这类全局查询会返回所有笔记本的结果。CLI 不会拦截整个查询（那样什么都查不了），而是在拿到内核返回后，自动剥离被 deny 的笔记本/文档的数据：

```bash
# 查询 denied 笔记本的文档
siyuan api query.sql "SELECT id, box FROM blocks WHERE box='20231224140619-bpyuay4' LIMIT 5"
```

```
{"warning":"CONTENT_FILTERED","removed":5,"reasons":"5x: rule #1"}
0 rows
```

对 Agent 来说，被禁止的笔记本就像不存在一样——列表里看不到、查询查不到、写入写不进。

### 风险自动审批

在用户配置的规则之外，CLI 还会根据每个操作的性质自动推导风险等级。批量删除、系统级写操作这类高风险操作，即使你的规则没有拦截，也会自动触发人工审批。这层保护相当于一个兜底的安全网。

触发审批的操作会自动在浏览器里打开一个审批页面，操作详情一目了然，点 Approve 或 Reject 就行。

![Approval Center](assets/approval-center.png)

也可以纯终端操作：`siyuan approval list` 查看待审批，`siyuan approval approve <id>` 放行。自动化场景可以用 `--yes` 跳过审批（`behavior.allowYes: false` 可禁用这个开关，强制走审批流程）。

---

## Workspace 管理

Agent 工具经常面对一个问题：我现在操作的是哪个思源实例？siyuan-cli 用命名 workspace 管理连接，注册一次，后续靠名字引用：

```bash
siyuan workspace add home   --url http://127.0.0.1:6806 --token <token>
siyuan workspace add remote --url http://192.168.1.100:6806 --token <token>
siyuan workspace use home
```

Token 不一定要明文写在命令行里。CLI 支持从环境变量（`--token-env`）、文件（`--token-file`）或外部命令（`--token-command`）读取 token，避免在配置和 shell 历史里留下明文凭据。

全局默认在多项目场景下会互相干扰。解决办法是在项目根目录放一个 `.siyuan-cli.yaml`，把这个目录钉死到某个 workspace：

```yaml
schemaVersion: 1
workspace: remote
```

这个文件可以安全提交到 Git——CLI 不允许在里面放 token 或 URL。解析优先级：`--workspace` 参数 > `$SIYUAN_CLI_WORKSPACE` 环境变量 > `.siyuan-cli.yaml` > 全局默认。

这个设计意味着你可以为不同的项目配置不同的思源连接，搭配不同的权限规则。项目 A 连接本地思源，只允许操作「项目 A 笔记本」，写操作需要审批；项目 B 连接另一个实例，开放更大的权限范围；个人日常用全局默认，权限宽松一些。任何时候跑 `siyuan workspace which` 就能看到完整的解析结果：

```json
{
  "workspace": "home",
  "source": "project-file",
  "hasToken": true,
  "projectConfigPath": "/path/to/project/.siyuan-cli.yaml",
  "permission": {
    "default": "allow",
    "ruleCount": 3,
    "rules": [
      { "endpoint": "system.exit", "effect": "deny" },
      { "endpoint": "system.*", "effect": "approval" }
    ]
  }
}
```

当前用的哪个 workspace、从哪一层配置来的、生效的权限规则是什么，一目了然。

---

## 可扩展

siyuan-cli 内置了思源目前大部分公开 API，但思源在持续迭代，总有 CLI 还没来得及注册的新 endpoint。同时每个人的使用习惯不同，可能需要一些定制化的组合操作。

对于临时需要调用的未注册 API，不用写扩展——`api raw` 提供了一个轻量的逃生口，在配置里 allowlist 一下就能直接调：

```yaml
behavior:
  rawApi:
    enabled: true
    allow: ["asset.getDocAssets"]
```

```bash
siyuan api raw asset.getDocAssets -j '{"id":"20240922152051-7dpjfpv"}'
```

如果某个 raw 调用你反复在用，那就值得升级为正式扩展。CLI 支持用户扩展，在 `~/.config/siyuan-cli/extensions/` 下用 TypeScript 写自定义的 endpoint 和 tool，运行时自动加载，和内置命令享受同一套待遇：参数校验、`--help`、`--dry-run`、权限检查。

两种扩展类型。**API 扩展**是给思源还没被 CLI 注册的内核 API 写一个结构化封装——写好之后它就和内置 API 一样通过 `siyuan api <id>` 调用，有参数校验，有权限控制。**Tool 扩展**是把你常用的多步操作封装成一条命令，比如「读取某个文档的所有二级标题汇总成摘要」，写成一个 tool 以后一条命令就搞定。

比如写一个自定义 tool，放在 `extensions/tools/hello.ts`：

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
    return { content: `Hello, ${name}!` };
  }
};
```

```bash
siyuan extension init          # 初始化扩展目录
siyuan extension cache         # 编译并生成 schema 缓存
siyuan tool hello-ext --name Alice
# → Hello, Alice!
```

这和前面说的「基础设施定位」是一致的：siyuan-cli 提供运行时框架，你往里面填充适合自己工作流的零件。如果某个扩展你用得很频繁，它就是你的 siyuan-cli 使用体验的一部分；如果你的需求不是代码层面的复用，而是 Agent 层面的工作流策略（比如"遇到什么场景该做什么"），那更适合写成一个下游的 Agent SKILL，而不是一个 CLI 扩展。

—— 注意，你没有必要完全手写，siyuan-cli 内置了如何扩展的文档，你可以直接和 AGENT 说让他帮你扩展。

---

## Agent 怎么知道怎么用

siyuan-cli 面向 Agent 场景的一个具体体现是：它自带一套完整的参考文档，Agent 可以直接通过命令发现和阅读。

```bash
siyuan doc list                          # 列出所有文档
siyuan doc read recipes/edit-content.md  # 读某篇操作指南
```

文档分三类：

- **思源领域知识**（`siyuan-guide/`）：block 数据模型、path 和 hpath 的区别、SQL 查询策略、日记路径规律
- **CLI 用法参考**（`cli-usage/`）：完整命令树、权限配置、扩展开发
- **操作 Recipes**（`recipes/`）：面向具体任务的标准流程——比如「安全编辑已有文档」会引导 Agent 先确认 workspace、检查目标、预览写操作、执行、读回验证

`siyuan skill install` 可以把一个精简的 SKILL 文件安装到 Agent 的配置目录（支持 `~/.claude`、`~/.agents` 等），让 Agent 在需要操作思源时自动发现这个工具。装好之后，Agent 会自动知道怎么用这个 CLI——它会读内置文档，了解思源的数据模型，按标准流程操作。你不需要记住每个命令的参数。

```bash
siyuan skill install                    # 安装到 ~/.agents/skills/
siyuan skill install --target claude    # 安装到 ~/.claude/skills/
```

---

## 上手

最简路径：

```bash
# 安装
npm install -g @frostime/siyuan-cli

# 连接你的思源
siyuan workspace add local --url http://127.0.0.1:6806 --token <token>
siyuan workspace verify local

# 试几个命令
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
siyuan tool list-doc-tree --entry <notebook-id>

# 给你的 Agent 装上 skill
siyuan skill install
```

如果想限制 Agent 能做什么，在 `~/.config/siyuan-cli/config.yaml` 的 workspace 下加 `permission.rules` 就行。最低限度建议至少加上：

```yaml
permission:
  default: allow
  rules:
    - endpoint: "system.exit"
      effect: deny
```

以上这些配置没有必要自己动手：打开一个 AGENT，让他自己阅读 siyuan cli 自带的 SKILL 和文档，然后让他帮你配置即可。

---

Beta 阶段，不保证向前兼容。有问题或想法欢迎到 GitHub 提 issue。

GPL-3.0 开源，要求 Node.js ≥ 20。

GitHub：https://github.com/frostime/siyuan-cli

npm：`npm install -g @frostime/siyuan-cli`

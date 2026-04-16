# 06 · Skill 模块（Agent 消费的使用说明书）

> 本篇要回答什么：Skill 的规范？本项目内置哪些 Skill？install 的目标目录？模板变量？

## 1. 什么是 Agent Skill

Agent Skill 是 Anthropic 提出的开放标准（参见 agentskills.io 和 Claude Code Skills 文档）。一个 Skill 就是一个目录，包含：

- `SKILL.md`：主文件，YAML frontmatter + Markdown 正文
- 可选的 `scripts/`、`references/`、`assets/`

frontmatter 规范：

```yaml
---
name: kebab-case-name              # ≤64 字符，小写字母 / 数字 / 连字符
description: "..."                 # ≤1024 字符，必须明确说明"做什么 + 何时用"
---
```

**Claude Code / Claude Agent SDK / Claude.ai** 启动时都会读取所有已安装 Skill 的 frontmatter 放入系统提示；用户提问命中 description 时，Claude 按需加载 SKILL.md 正文。

## 2. 本项目内置 Skill

### 2.1 `siyuan-cli`（主 Skill）

作用：教 Agent 如何使用本 CLI。

```
skills/siyuan-cli/
├── SKILL.md                         # 主文件
├── references/
│   ├── sql-cheatsheet.md            # SiYuan SQL 速查
│   ├── block-types.md               # 块类型（d/p/h/l/i/c/...）
│   ├── common-workflows.md          # 常见任务的命令序列
│   └── error-codes.md               # CLI exit code 与错误类型
└── scripts/
    └── (可选) bash 辅助脚本
```

**SKILL.md 草稿**（摘选，完整版在 `skeleton/skills/siyuan-cli/SKILL.md`）：

```markdown
---
name: siyuan-cli
description: Manage SiYuan Note knowledge base via the `siyuan` CLI — list/search/create/update notebooks, documents, blocks. Use this skill whenever the user mentions SiYuan, 思源笔记, their personal knowledge base, notes, or wants to add/query/update notes. Supports multiple workspaces, block-level operations, SQL queries, and full-text search.
---

# SiYuan CLI

Use the `siyuan` command-line tool to interact with the user's SiYuan Note kernel.

## Prerequisites

1. Confirm `siyuan` is on PATH: `siyuan --version`
2. Confirm a workspace is configured: `siyuan workspace list`
3. If no workspace, run: `siyuan workspace add <n> --url http://127.0.0.1:6806 [--token <token>]`

## Command structure

... (详见完整文件)
```

### 2.2 `siyuan-cli-quickstart`（轻量版，可选）

初次接触 Agent 的快速上手指南（200 行以内），只介绍 3–5 个最常用命令。

## 3. `siyuan skill` 命令

### 3.1 `siyuan skill list`

```
siyuan skill list [--format json]
```

输出：

```json
[
  {
    "name": "siyuan-cli",
    "description": "Manage SiYuan Note knowledge base via...",
    "path": "<built-in>",
    "size": 12345,
    "version": "0.1.0"
  }
]
```

### 3.2 `siyuan skill read <n>`

打印 SKILL.md 正文到 stdout：

```
siyuan skill read siyuan-cli                                # 主文件
siyuan skill read siyuan-cli/references/sql-cheatsheet.md   # 读附带文件
siyuan skill read siyuan-cli --files                        # 列出所有文件
```

### 3.3 `siyuan skill install <n>`

```
siyuan skill install siyuan-cli [--target <target>] [--dest <path>] [--force] [--dry-run]
```

**Target 映射**：

| --target | 目标目录 | 备注 |
| --- | --- | --- |
| `agents` (默认) | `~/.agents/skills/<n>/` | 用户原文要求 |
| `claude` | `~/.claude/skills/<n>/` | Claude Code 标准 |
| `claude-project` | `./.claude/skills/<n>/` | 当前目录下的 `.claude` |
| `cursor` | `~/.cursor/skills/<n>/` | 如果 Cursor 兼容 Skill 标准 |
| `custom` | `<--dest 指定>` | 完全自定义 |

**行为**：

- 拷贝整个 Skill 目录到目标位置
- 目标已存在：除非 `--force` 否则报错并提示 diff
- `--dry-run` 仅打印将执行的操作
- 完成后输出目标路径和文件列表（JSON）

**模板变量替换**：

SKILL.md 内部可以用 `{{cli_version}}` 等占位符，install 时替换：

| 变量 | 替换值 |
| --- | --- |
| `{{cli_version}}` | `siyuan --version` 输出 |
| `{{workspace}}` | 当前 workspace 名 |
| `{{base_url}}` | 当前 workspace 的 baseUrl |
| `{{today}}` | `YYYY-MM-DD` |
| `{{cli_path}}` | `siyuan` 二进制的绝对路径 |

**重点**：用户可能多端安装，`install` 命令替换 `{{cli_path}}` 是为了解决"Skill 里写 `siyuan xxx`，Agent 找不到 PATH 中的 siyuan"这种常见问题，显式写全路径更稳。

### 3.4 `siyuan skill uninstall <n>`

```
siyuan skill uninstall siyuan-cli [--target <target>]
```

删除 target 目录下的对应 Skill。

## 4. Skill 中引用 CLI 命令的写法规范

在 SKILL.md 里写命令，要 **真正可执行**：

**推荐**：

```bash
# 始终写完整命令（不省略 --workspace）
siyuan --workspace {{workspace}} api query.sql "..."

# 对于输入：优先用 @file: 或 @stdin，避免 shell escape 地狱
siyuan api block.appendBlock \
  --parentID 20210817... \
  --data @file:./note.md

# 或明确使用 @stdin
echo "..." | siyuan api block.appendBlock --parentID "..." --data @stdin
```

**避免**：

```bash
# 不要假设 Agent 知道如何 escape 引号嵌套
siyuan api query.sql "SELECT 'it\\'s' FROM ..."
```

## 5. Skill 文件打包

### 5.1 内置 Skill 如何进入 npm 包

`package.json`：

```json
{
  "files": ["dist/**", "bin/**", "skills/**"]
}
```

运行时通过 `new URL("../../skills/", import.meta.url)` 定位（ESM）。

### 5.2 用户自定义 Skill

v0.2+：支持 `~/.config/siyuan-cli/skills/` 放自定义 Skill，`siyuan skill list` 合并显示（标记 `source: user` / `source: builtin`）。

## 6. 测试

- `tests/skills/frontmatter.test.ts`：验证每个内置 Skill 的 frontmatter 合规（name ≤ 64，description ≤ 1024，无保留字 "anthropic"/"claude"）
- `tests/skills/install.test.ts`：测试 install 到临时目录，幂等性 diff 为 0

## 7. 示例：Agent 使用流程

```
User: "帮我把今天讨论的要点记到思源"

Agent 内部：
  1. （Skill 已加载）读取 SKILL.md 了解到 `siyuan` 命令
  2. 执行 siyuan workspace list 确认可用
  3. 用 tool append-content --target-type dailynote --markdown @stdin <<<"..."
```

这个流程的可靠性取决于 SKILL.md 写得好不好 —— 所以 **写 Skill 的过程等同于在"训练"Agent，需要精细打磨**。参考 Anthropic 的 skill-creator 建议：Skill 的 description 要"稍微 pushy"一点，举例而非泛泛而谈。

---

下一篇 `07-module-permission.md` 展开权限模块（v2 按三段论重写）。

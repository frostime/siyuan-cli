# References · Agent Skill 标准速览

## 基本结构

一个 Skill 就是一个目录，顶层必须有 `SKILL.md`：

```
my-skill/
├── SKILL.md                          # 必需
├── references/                       # 可选：按需加载的补充文档
├── scripts/                          # 可选：辅助脚本
└── assets/                           # 可选：图片、模板等
```

## SKILL.md 规范

### Frontmatter（YAML）

```markdown
---
name: my-skill
description: 一句话描述 Skill 的作用与何时使用
---
```

**硬性规则**：

- `name`：小写字母、数字、连字符，≤ 64 字符
- `description`：≤ 1024 字符，必须写清 **做什么** + **何时使用**
- 不得包含 "Anthropic" / "Claude" 等保留词

### 正文

Markdown 任意结构。常见约定：

```markdown
# Skill Title

Brief intro.

## Prerequisites
- List tools, credentials, or env needed

## Workflow
Step-by-step instructions.

## Commands / Patterns
Code blocks showing what to run.

## References
- Link to files in `references/` for deeper info
```

## 加载机制

- Claude Code / Claude Agent SDK / Claude.ai 启动时扫描 skill 目录
- frontmatter 的 `description` 被放入系统提示
- 当用户请求命中 description 时，Claude 按需加载 `SKILL.md` 正文
- `references/` 里的文件默认不加载，只有 SKILL.md 正文里用 `see references/xxx.md` 指引 Agent 主动读取时才会加载

## 标准目录（默认扫描位置）

| 工具 | 目录 |
| --- | --- |
| Claude Code | `~/.claude/skills/<n>/` 或 `./.claude/skills/<n>/`（项目级） |
| 通用 / 约定俗成 | `~/.agents/skills/<n>/` |
| Cursor / 其他 | 各自文档 |

## 写好 description 的建议（来自 Anthropic skill-creator）

1. **包含触发词**：枚举用户可能提到的关键名词（产品名、术语、别名）
2. **举例而非泛泛**：`Manage SiYuan notes (query, create, update blocks)` > `Work with notes`
3. **标明何时使用**：`Use this skill whenever the user mentions SiYuan, 思源笔记, ...`
4. **"稍微 pushy"**：对相关话题主动声明能力，而不是被动等待触发

反例：

```yaml
description: "A skill for notes."                 # 太短、触发不了
```

正例：

```yaml
description: "Manage SiYuan Note knowledge base via the `siyuan` CLI — 
list/search/create/update notebooks, documents, blocks. 
Use this skill whenever the user mentions SiYuan, 思源笔记, their personal 
knowledge base, notes, or wants to add/query/update notes. Supports multiple 
workspaces, block-level operations, SQL queries, and full-text search."
```

## 测试你的 Skill

1. 把 skill 放到 `~/.claude/skills/<n>/`
2. 在 Claude Code 里新开会话
3. 用 `/skills` 检查是否被识别
4. 发一条应该触发它的消息，看 Claude 是否加载
5. 再发一条不该触发的消息，确认不会误触

## 本项目 Skill 的特殊约定

- **包含可替换模板变量**：`{{cli_version}}`、`{{workspace}}`、`{{base_url}}`、`{{today}}`、`{{cli_path}}`
- `siyuan skill install` 时完成替换后再拷贝到目标目录
- 这样确保 Skill 里写的命令对当前环境直接可执行

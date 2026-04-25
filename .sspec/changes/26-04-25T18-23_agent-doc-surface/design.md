---
change: "agent-doc-surface"
created: 2026-04-25T18:23:58
---

# Design: agent-doc-surface

<!-- 本文件记录技术设计详情。创建条件：
变更涉及新接口定义、数据模型变更、或架构逻辑改动。
简单 bugfix/文案修改不需要此文件。 -->

<!-- QUALITY BAR (不可违反):
用半结构化、形式化的表达替代平铺直叙的纯文本。
核心目标：提高信息密度，降低不确定性，提高用户理解效率。
一句话：能展示的不要叙述 (show, don't describe)。

常见手段 (非穷举):
- typed code block: 接口、类型、Schema、配置、prompt...
- ASCII diagram: 调用链、状态机、模块树、内容大纲...
- table: before/after 对比、选项权衡、scope 映射...
- labeled items: 多项变更标注 (Fix A / Feat B / Step 1...)
- 伪代码、决策树、约束列表等同样有效

Anti-pattern:
  ❌ "我们将添加一个接受 X 返回 Y 的函数"
  ✅ `def process(x: Input) -> Output: ...`

  ❌ "请求先经过 A 模块处理，然后传递给 B"
  ✅ request → A.validate() → B.process() → response
-->

<!-- 按变更性质组织本文档。没有固定章节要求。
以下是不同类型变更的参考组织方式 (选用，不强制):

Feature/Bugfix  → 接口签名 + 行为流程 + 数据模型
Refactor        → Before/After 结构对比 + 迁移步骤
文档/模板       → 内容大纲 + 章节层级
Prompt/规则     → Before/After 示例 + 决策逻辑
配置/Schema     → Schema 定义 + 迁移路径 + 兼容性策略
-->

## Command surface

```text
siyuan
├── workspace
├── api
├── tool
├── doc
│   ├── list
│   └── read <path-or-name>
└── skill
    ├── install [--target <name>] [--local]
    ├── read
    └── uninstall [--target <name>] [--local]
```

## Docs model

```text
src/docs/
├── README.md
├── recipes/
│   ├── connect-workspace.md
│   ├── find-target.md
│   ├── read-content.md
│   └── edit-content.md
├── siyuan-guide/
└── cli-usage/
```

Each doc uses minimal frontmatter:

```md
---
title: Edit content
summary: Safely locate a document or block, inspect it, update content, and verify the result.
---
```

## `doc` runtime behavior

### Docs root resolution

```ts
function getDocsRoot(): string
```

Resolution:

```text
src/cli.ts running from dist  -> ../src/docs
src/cli.ts running from src   -> ./docs
```

### Doc record shape

```ts
interface BuiltinDoc {
  relPath: string;     // e.g. recipes/edit-content.md
  absPath: string;     // real on-disk path
  title: string;
  summary: string;
}
```

### List output contract

```text
Docs root: <abs-docs-root>

README.md
  Path: <abs-docs-root>/README.md
  <summary>

recipes/connect-workspace.md
  Path: <abs-docs-root>/recipes/connect-workspace.md
  <summary>
```

Ordering:

1. `README.md`
2. `recipes/*` lexical
3. remaining docs lexical

### Read resolution flow

```text
input
  → exact relative path match
  → basename match without extension
  → basename match with extension
  → 0 match  -> DOC_NOT_FOUND
  → >1 match -> DOC_AMBIGUOUS with candidate relPaths
```

`doc read` prints the resolved absolute path followed by content.

## Help disclosure contract

Every agent-facing docs entry point discloses the actual path.

```text
siyuan --help
  → docs root
  → README.md path
  → recipes/*.md path glob
  → guide/config path globs
  → hint: siyuan doc list

siyuan doc --help
  → docs root
  → same path disclosure

siyuan doc list
  → docs root + each file path

siyuan doc read ...
  → resolved file path + content
```

## Skill behavior

Single bundled skill assumption:

```ts
const BUILTIN_SKILL_NAME = 'siyuan-cli';
```

Public API shape:

```ts
type SkillTargetOpts = {
  target?: string;
  local?: boolean;
  dryRun?: boolean;
};

readSkill(): string
installSkill(opts?: SkillTargetOpts): Result
uninstallSkill(opts?: Omit<SkillTargetOpts, 'dryRun'>): Result
```

Target resolution:

```text
skill install                    -> ~/.agents/skills/siyuan-cli
skill install --target agents    -> ~/.agents/skills/siyuan-cli
skill install --target .pi       -> ~/.pi/skills/siyuan-cli
skill install --target .pi --local -> <cwd>/.pi/skills/siyuan-cli
```

Normalization rule for `<name>`:

```text
agents  -> preserved as `agents`
claude  -> preserved as `claude`
.pi     -> preserved as `.pi`
pi      -> normalized to `.pi`
foo     -> normalized to `.foo`
.foo    -> preserved as `.foo`
```

Resolution algorithm:

```text
special target `agents` -> {local:false} ~/.agents/skills/
special target `claude` -> {local:false} ~/.claude/skills/
other target `<name>`   ->
  normalize name to leading-dot form
  --local absent -> ~/<normalized>/skills/
  --local present -> <cwd>/<normalized>/skills/
```

Install behavior:

```text
missing target  -> copy + template apply + action=installed
existing target -> replace + template apply + action=updated
```

Design constraints:

- `agents` and `claude` stay as explicit compatibility shortcuts
- dot-prefixed names are the canonical internal representation for generic targets
- bare names are accepted as user-friendly input and normalized to dot-prefixed directory names
- `--local` switches from home-directory scope to project-directory scope

## File responsibilities

| File | Responsibility |
|---|---|
| `src/core/docs.ts` | docs root, frontmatter parse, list/read/resolve |
| `src/commands/doc.ts` | CLI command wiring and display |
| `src/cli.ts` | register `doc`, central help disclosure |
| `src/core/skills.ts` | single-skill operations, target normalization, and path resolution |
| `src/commands/skill.ts` | simplified CLI surface with `--target <name> [--local]` |
| `skills/siyuan-cli/SKILL.md` | bootstrap guidance aligned with docs root disclosure |

## Verification targets

| Area | Check |
|---|---|
| Top-level help | shows real docs root and recipes paths |
| `doc list` | lists docs with stable order and absolute paths |
| `doc read` | resolves path-or-name and prints resolved path |
| `skill install` | works with no skill name, supports `--target <name> [--local]`, and updates existing target |
| `skill read` | prints builtin SKILL with no positional name |
| Target normalization | `pi` and `.pi` resolve to the same target directory family |
| Docs | recipes exist and README links to them |

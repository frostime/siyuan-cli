# P3 Design

## 1. Tool Runtime Contract

继续沿用 `src/core/schema.ts` 中现有的 `ToolSchema / ToolResult / ToolContext` 类型。
新增 `src/core/tools.ts` 提供：

```ts
class ToolRegistry {
  register(tool: ToolSchema): void
  get(id: string): ToolSchema | undefined
  list(filter?: { tag?: string }): ToolSchema[]
}

interface RunToolOptions {
  tool: ToolSchema;
  input: unknown;
  ctx: ToolContext;
  output: { details?: boolean; only?: "content"|"details"; format?: "json"|"pretty"|"yaml" }
}
```

## 2. Tool Output Policy

默认 stdout 只输出 `content`。

| 模式 | stdout |
|------|--------|
| default | `content` |
| `--details` | `{ content, details }` JSON |
| `--only details` | `details` JSON |
| `--only content` | `content` |

warnings/meta 仍走 stderr。

## 3. MVP Tools

### `list-doc-tree`
- input: `entry`, `depth`, `includeMeta`
- impl: 优先通过 `query.sql` + `filetree.getHPathByID` / path 前缀构树

### `list-dailynote`
- input: `date`, `mode`, `filterNotebook`
- impl: `query.sql` 读取 daily note blocks

### `append-content`
- input: `targetId`, `targetType`, `markdown`
- impl: `block.appendBlock`; dailynote 模式后续可先简化为 document/block

### `resolve-path`
- input: `hpath` xor `id`
- impl: `query.sql` 查询 `id, box, path, hpath`

## 4. Skill Runtime Contract

`src/core/skills.ts` 提供 builtin skill 发现与安装：

```ts
interface SkillEntry {
  name: string;
  description: string;
  path: string;        // builtin absolute path
  source: "builtin";
}

function listBuiltinSkills(): SkillEntry[]
function readSkill(rel: string): string
function installSkill(name: string, opts: { target?: string; dest?: string; force?: boolean; dryRun?: boolean }): InstallResult
```

## 5. Skill Install Targets

优先支持：
- `agents` → `~/.agents/skills/<name>/`
- `custom` → `--dest`

其余 target（claude/cursor）可在 V0.2 扩展。

## 6. Builtin Skill Packaging

目录：

```text
skills/
└── siyuan-cli/
    ├── SKILL.md
    └── references/
        ├── sql-cheatsheet.md
        ├── block-types.md
        ├── common-workflows.md
        └── error-codes.md
```

P3 只要求最小可用内容，后续可继续润色。

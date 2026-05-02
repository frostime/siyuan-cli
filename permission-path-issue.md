# Permission `path` 字段的语义缺口

> 创建: 2026-05-01
> 标签: permission, path, design-gap, documentation

---

## 问题

权限规则的 `path` 字段在匹配文档时存在三个嵌套问题，导致用户几乎不可能凭直觉写对规则。

### 1. `path` 匹配的是 `blocks.path` 列的原始值，包含 `.sy` 后缀

```sql
SELECT path FROM blocks WHERE id = '20230725154155-hq3iw5w';
-- → /20230725154155-hq3iw5w.sy
```

SiYuan 内部用 `.sy` 标记文档文件，`blocks.path` 列完整保留了此后缀。但 `path` 规则直接用 micromatch 匹配原始值，**未做任何归一化**。用户写：

```yaml
path: "**/20230725154155-hq3iw5w"    # ❌ 静默不匹配
```

实际路径以 `.sy` 结尾，`**/id` 要求字符串以 `id` 结尾 → 不匹配 → 规则静默 fallthrough → `default: allow` → **看起来配了，实际没生效**。

正确写法需要用户"碰巧知道"有 `.sy`：

```yaml
path: "**/20230725154155-hq3iw5w.sy"  # ✅
```

### 2. `path` 是完整路径，不是 ID 匹配

规则条件名 `path`，用户容易误以为"填文档 ID 就能匹配"。但实际上：

| 文档位置 | `blocks.path` | `path: "/id"` 是否匹配 | `path: "**/id"` 是否匹配 |
|----------|---------------|----------------------|------------------------|
| 笔记本根级 | `/id.sy` | ❌（缺 `.sy`） | ❌（缺 `.sy`） |
| 嵌套一级 | `/parent/id.sy` | ❌ | ❌（缺 `.sy`） |
| 嵌套多层 | `/grand/parent/id.sy` | ❌ | ❌（缺 `.sy`） |

### 3. 无通配符 = 精确字符串

micromatch/picomatch 的行为：没有 glob 通配符时等价于 `===`。`/id` 只匹配字面量 `/id`，不做子串扫描。这是 glob 标准行为，但对用户不直观。

---

## 修正后的正确写法

```yaml
permission:
  rules:
    - path: "**/<文档ID>.sy"
      effect: deny
```

### 匹配效果

| 目标 | 路径 | 是否匹配 |
|------|------|----------|
| 目标文档自身 | `/docId.sy` | ✅ |
| 目标文档内的段落/标题等 | `/docId.sy`（同属父文档） | ✅ |
| 子文档 | `/docId/child.sy` | ❌ |
| 嵌套下的目标文档 | `/parent/docId.sy` | ✅ |
| 父/兄弟文档 | `/parent.sy` / `/parent/sibling.sy` | ❌ |

---

## 修复建议

### ~~Option A — 加归一化~~

> User: 否决这条

在 `permission.mjs` 的 `matchGlob` 或 `matchesResource` 前，对 `ctx.path` 做 `.sy` strip：

```js
// 匹配前归一化
const normalizedPath = ctx.path.replace(/\.sy$/, "");
```

同时用户只需写：

```yaml
path: "**/20230725154155-hq3iw5w"    # 不需要 .sy
```

兼容性：现有 `path: "**/id.sy"` 的规则仍能匹配（`/id.sy` strip 后变为 `/id`，`**/id.sy` 作为 pattern 不匹配 `/id`……需要额外处理）。

### Option B — 加 `id` 规则字段

> User: 否决，如果要，建议改成 root_id 匹配所在的文档

新增条件字段 `id`，用户直接填 block ID：

```yaml
rules:
  - id: "20230725154155-hq3iw5w"
    effect: deny
```

底层自动做 `resolveContentId → notebook + path`，用户不需要理解 path 格式、glob 语法、`.sy` 后缀。这是最直觉的表达。

### Option C — 最小改动：只补文档

> User: 有必要

在 `cli-usage/permission.md` 的 `path` 字段说明中明确：
- `blocks.path` 包含 `.sy` 后缀，规则必须包含
- 嵌套文档需用 `**/` 前缀
- 给出 `**/<id>.sy` 作为"按 ID 封锁某文档"的推荐模板
- 提醒无通配符 = 精确匹配，不是子串匹配

同时在启动时（或 `workspace which`）对 `path` 规则值不包含 `.sy` 的给出 warning（类似已有的 `LIKELY_HPATH_NOT_ID`）。

---

## 优先级判断

| 维度 | 评分 |
|------|------|
| 用户影响 | **高** — 静默不匹配，用户以为规则生效实际没有 |
| 触发频率 | **高** — 任何想按 ID 封锁文档的用户必然遇到 |
| 修复成本 | Option A/C 低，Option B 中 |
| 破坏性 | Option A 需处理兼容性；Option B/C 无破坏 |

**建议**：Option C（补文档 + 加 warning）是立即可做的最低成本改进。Option A 或 B 可在下个大版本考虑。

---

## 相关文件

- `dist/shared/permission.mjs` — `matchesResource`、`matchGlob`、`resolveContentId`
- `src/docs/cli-usage/permission.md` — 权限规则文档
- `dist/api/guard.mjs` — `executeEndpoint` 中 payload 解析 → Phase 2 流程

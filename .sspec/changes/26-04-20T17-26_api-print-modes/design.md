---
change: "api-print-modes"
created: 2026-04-20T17:26:01
---

# Design: api-print-modes

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

## Interface Contract

```ts
export interface EndpointFormatContext {
    endpoint: RegisteredEndpoint;
    payload: unknown;
    result: unknown;
    args: GlobalArgs;
}

export interface EndpointSchema {
    endpoint: string;
    summary: string;
    description?: string;
    payload: JSONSchema;
    response?: JSONSchemaProperty;
    classification: EndpointClassification;
    minKernelVersion?: string;
    deprecated?: { replacement?: string; removeAt?: string; reason?: string };
    multipart?: { fileFields: string[] };
    cli?: CliBehavior;
    guard?: GuardSpec;
    format?: (ctx: EndpointFormatContext) => string;
}
```

## Runtime Flow

```text
siyuan api <id> ...
  → parsePayload()
  → loadConfig() / resolveEffectiveWorkspace()
  → executeEndpoint()
      → payload guard
      → confirmation / dry-run
      → client.call() or upload()
      → response guard
  → renderEndpointResult(entry, payload, result, args)
      → --print json       => stdout JSON(result)
      → --print compact
          → entry.schema.format ? try format(ctx)
          → success        => stdout compact string
          → throw / invalid => stderr warning + stdout JSON(result)
```

## Rendering Rules

| Mode | Formatter exists | Formatter succeeds | Stdout | Stderr |
|---|---|---|---|---|
| `json` | any | any | raw JSON | none |
| `compact` | no | n/a | raw JSON | none |
| `compact` | yes | yes | formatter string | none |
| `compact` | yes | no | raw JSON | formatter warning |

## Why top-level `format`

| Option | Fit | Notes |
|---|---|---|
| Top-level `format` | Best | Matches user proposal, small delta, schema authors see it immediately |
| `cli.renderCompact` | Good | Strong layering, but couples presentation to CLI-only subobject |
| Renderer map | Future-ready | Larger abstraction than current need |

Selected path: top-level `format` for v1.

## Compatibility and Lifecycle Assessment

### Lifecycle impact

```text
schema authoring
  → optional format hook added in src/apis/**
startup registration
  → registry validation unchanged for endpoints without format
api execution
  → executeEndpoint remains source of truth for safety and filtering
stdout rendering
  → new final-stage branch only
help / docs
  → api help and docs expose print modes and formatter authoring guidance
```

### Compatibility considerations

| Area | Impact | Decision |
|---|---|---|
| Existing API stdout default | Breaking surface change | User requested `compact` default; raw JSON preserved via `--print json` |
| Existing tools | None | Tool path stays unchanged |
| Programmatic callers using current API stdout | Medium risk | Must document migration clearly in README and CLI docs |
| Permission / guard semantics | None | Formatting happens after guarded result exists |
| `api describe` output | Small | Serialize `format` as `[Function]` like `guard.filterResponse` |
| Dry-run writes | Supported | Compact formatter may render dry-run object; fallback JSON remains safe |

## Endpoint Adoption Strategy

### V1 framework
- All API endpoints gain `--print compact|json`
- Any endpoint can remain raw-JSON-only by omitting `format`
- Fallback semantics guarantee zero endpoint-blocking rollout risk

### First formatter candidates

| Endpoint | Value | Compact shape sketch |
|---|---|---|
| `query.sql` | Very high | table-like row summary or JSON lines with row count cap |
| `search.fullTextSearchBlock` | Very high | numbered hit list with block id/path snippets |
| `block.getBlockKramdown` | High | plain markdown/kramdown body |
| `filetree.listDocsByPath` | High | line list of docs with id/path/title |
| `file.readDir` | Medium | directory listing with file type / size |
| `system.version` | Medium | version string |

## Failure policy

```text
formatter throws OR returns non-string
  → stderr: { warning: "FORMAT_FAILED", endpoint, message }
  → stdout: JSON.stringify(result, null, 2)
  → exit code stays 0
```

This keeps API access reliable while letting formatter rollout stay incremental.

## Open design points for align

| Topic | Current recommendation | Why it matters |
|---|---|---|
| Compact style shape | Human-first concise text, not strict tables | Token savings depend on output shape |
| Formatter context payload | Include `payload` and `args` in v1 | Enables dry-run-aware and param-aware rendering |
| Shared renderer placement | Extract a shared result-render helper | Keeps API/tool print logic consistent |

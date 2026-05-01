# siyuan-cli

A command-line interface that lets external agents (Claude Code, Codex, OpenCode, etc.) operate [SiYuan Note](https://b3log.org/siyuan/) safely and effectively.

SiYuan already exposes an HTTP kernel API — but raw HTTP calls lack connection management, access control, and self-documentation that agentic workflows demand.

`siyuan-cli` fills those gaps: named workspace connections, declarative permission rules with request interception and response filtering, a structured command surface with full introspection, composable high-level tools, a user extension system, and a complete built-in doc set that agents can discover on their own.

> **Alpha** · v0.11 · Node.js ≥ 20 · [GPL-3.0](LICENSE)

---

## What It Does

- **Workspace management** — Register named connections to SiYuan kernels; persist across sessions. Pin each project to a specific workspace via `.siyuan-cli.yaml` so multiple projects never interfere.

- **Structured API surface** — All 60+ public SiYuan kernel endpoints become typed subcommands with parameter validation, `--help`, `--dry-run` preview, and compact output formatting.

- **High-level tools** — Composite operations (document tree traversal, daily note append, block content read with pagination, path resolution) that would otherwise require multi-step API orchestration.

- **Permission & guard system** — Declarative rules intercept dangerous requests before they reach the kernel, filter sensitive items out of global query results, and route destructive operations through a browser-based Approval Center for human sign-off.

- **User extensions** — Write custom API endpoints and workflow tools in TypeScript under `~/.config/siyuan-cli/extensions/`, loaded at runtime with the same CLI surface as built-ins.

- **Built-in docs & agent skill** — A full reference doc set ships with the package; agents discover and read it through the CLI itself. A SKILL file can be installed into agent config directories for automatic discovery.

---

## Quick Start

```bash
npm install -g @frostime/siyuan-cli
siyuan skill install
```

---

```bash
# 1. Register a workspace pointing at your local SiYuan kernel
siyuan workspace add local --url http://127.0.0.1:6806 --token <your-token>

# 2. Verify the connection
siyuan workspace verify local

# 3. Run a query
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"
```

Output (compact format, default):

```
5 rows [hpath, id]
1: /Restructure misc model provider | 20251111144823-0lhpmav
2: /Agent experiment design | 20260305172423-yswy868
3: /Prompt | Optimize notebook content | 20260124162935-qf9u737
...
```

If you don't know the port, use workspace directory auto-discovery (local only):

```bash
siyuan workspace add devspace --workspace-dir /path/to/SiYuanDevSpace --token <token>
```

Or more simple, launch an local agent, and say: "Help me to use siyuan-cli, read the SKILL and its builtin documents".

---

## Calling Kernel APIs

Every registered SiYuan endpoint becomes a subcommand under `siyuan api`. The endpoint id format is `<group>.<name>`, derived from the kernel path `/api/<group>/<name>`.

```bash
# List all endpoints, optionally filter by group or tag
siyuan api --help
siyuan api list --group block

# View parameter schema and usage examples
siyuan api block.updateBlock --help
```
![API Help](asset/20260501162353.png)

![Update Block](asset/20260501162444.png)

### Invocation styles

```bash
# Positional primary field (the first required string parameter)
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' LIMIT 5"

# Named flags
siyuan api block.getBlockKramdown --id 20260425162235-pnpy21c

# Entire payload as inline JSON
siyuan api block.updateBlock -j '{"id":"...","data":"## New heading","dataType":"markdown"}'

# Entire payload from a JSON file (useful for complex payloads)
siyuan api block.updateBlock -f payload.json

# Payload from stdin
cat payload.json | siyuan api block.updateBlock -f -
```
![Invoke Demo](asset/20260501162653.png)

### Flexible input sources

Some string fields accept content from external sources, so you don't have to inline large markdown or SQL into shell arguments. Which fields support which sources is declared per endpoint — check `<endpoint> --help` for the **INPUT SOURCES** section.

| Syntax | Meaning |
|--------|---------|
| `"plain text"` | Literal value (always available) |
| `@file:./path` | Read content from a file, resolved from cwd |
| `@stdin` | Read from stdin (single-use per invocation) |
| `@env:VAR_NAME` | Read from an environment variable |
| `@@file:...` | Escape — pass the literal string `@file:...` |

This is particularly useful for write operations where the content is long or contains characters that are awkward to escape in shell:

```bash
# Write a markdown file's content into a block
siyuan api block.updateBlock --id <id> --data @file:./content.md --dataType markdown

# Pipe SQL from another command
echo "SELECT id FROM blocks WHERE type='d' LIMIT 3" | siyuan api query.sql @stdin

# Read token from environment at runtime
siyuan workspace add ci --url http://ci-host:6806 --token @env:SIYUAN_TOKEN
```

For agents, `@file:` is especially valuable — the agent can write content to a temp file first, then pass it to the CLI, avoiding shell escaping issues entirely.

### Output and debugging

```bash
# Default: compact human-readable output (when the endpoint defines a formatter)
siyuan api query.sql "SELECT id, hpath FROM blocks LIMIT 5"

# Raw JSON from the kernel
siyuan api query.sql "SELECT id, hpath FROM blocks LIMIT 5" --print json

# Preview a write operation without sending it to the kernel
siyuan api block.deleteBlock --id <id> --dry-run

# Print the equivalent curl command to stderr
siyuan api block.updateBlock --id <id> --data "new text" --debug
```

Dry-run output includes a `wouldRequestApproval` field, telling you whether the current permission config would trigger the Approval Center for this operation.

Errors always go to stderr as single-line JSON; stdout stays clean for piping. Exit codes are semantic: 0 = success, 1 = general error, 2 = config, 3 = network, 4 = auth, 5 = permission denied.

---

## High-Level Tools

Many real tasks require multiple API calls. For example, "append content to today's daily note" involves creating the daily note if it doesn't exist, resolving its id, then calling the append API. Tools wrap these multi-step workflows into single commands.

```bash
# Append to today's daily note (auto-creates if needed, resolves id internally)
siyuan tool append-content \
  --targetId <notebook-id> --targetType dailynote \
  --markdown "## Today's notes\nNew content here"

# Append from a file
siyuan tool append-content \
  --targetId <doc-id> --targetType document \
  --markdown @file:./notes.md

# Document tree listing
siyuan tool list-doc-tree --entry <notebook-id> --depth 2
```

```
# Document tree: daily note
- 2026 (20260319110807-rpatefx)
  ├─ 03 (20260319110808-qvgecjr) (+3)
  └─ 04 (20260425162235-bxpakql) (+2)
```

```bash
# Daily notes by date range
siyuan tool list-dailynote --afterDate 2026-04-01

# Read document content with pagination
siyuan tool get-block-content <doc-id> --slice "0:30" --showId true
# Continue from where you left off
siyuan tool get-block-content <doc-id> --slice "<last-block-id>:+20"

# Block metadata inspection (includes TOC for document blocks)
siyuan tool get-block-info <block-id>

# Path resolution — translate human-readable paths to stable ids
siyuan tool resolve-path --hpath "/private/diary"
```

All tools support `--dry-run`, `--help`, and `--print json`. Run `siyuan tool list` for the full list.

![Tool Demo](asset/20260501162956.png)

---

## Workspace Management

### Global configuration

Workspace connections are stored in `~/.config/siyuan-cli/config.yaml` (also respects `$XDG_CONFIG_HOME` and `$SIYUAN_CLI_CONFIG`), created automatically by `workspace add`.

```bash
siyuan workspace add local  --url http://127.0.0.1:6806 --token <token>
siyuan workspace add remote --url http://192.168.1.100:6806 --token <token>
siyuan workspace use local          # set global default
siyuan workspace list               # list all configured workspaces
siyuan workspace verify local       # test connection and auth
```

Tokens can be stored literally or sourced from environment variables at runtime:

```yaml
workspaces:
  prod:
    baseUrl: http://192.168.1.100:6806
    tokenSource:
      type: env
      value: SIYUAN_TOKEN       # resolved at call time, never written to config
```

### Project-level pinning

When multiple projects talk to different SiYuan instances, a global default causes conflicts. Place a `.siyuan-cli.yaml` at your project root to pin that project to a workspace:

```yaml
# .siyuan-cli.yaml — safe to commit (the CLI hard-errors if you put tokens or URLs here)
schemaVersion: 1
workspace: prod   # must exist in the global config
```

The full resolution chain:

```
--workspace flag  →  $SIYUAN_CLI_WORKSPACE  →  .siyuan-cli.yaml  →  config.current
```

Use `siyuan workspace which` at any time to inspect how the current directory resolves — it shows the resolved workspace, its source, the base URL, whether a token is present, and the full permission rule list.

---

## Permission & Guard System

Letting an agent freely operate on your personal notes is risky. SiYuan's kernel API includes endpoints that delete documents, close notebooks, or even shut down the kernel (`system.exit`). The CLI enforces access control at two levels: **request interception** (blocking or gating operations before they reach the kernel) and **response filtering** (stripping disallowed items from query results after the kernel responds).

### Permission rules

Rules are declared per workspace (or per project in `.siyuan-cli.yaml`) and evaluated top-to-bottom — first match wins:

```yaml
workspaces:
  prod:
    baseUrl: http://192.168.1.100:6806
    tokenSource: { type: env, value: SIYUAN_TOKEN }
    permission:
      default: allow
      rules:
        # Hard-block kernel shutdown
        - endpoint: "system.exit"
          effect: deny

        # All other system.* endpoints require human approval
        - endpoint: "system.*"
          effect: approval

        # Block writes to a specific document subtree
        - path: "/20260107143325-zbrtqup/**"
          action: write
          effect: deny

        # Deny all access to a specific notebook
        - notebook: "20220305173526-4yjl33h"
          effect: deny
```

Rules can combine any of these filter dimensions:

| Field | Match method | Example |
|-------|-------------|---------|
| `endpoint` | glob | `system.*`, `block.get*` |
| `tool` | glob | `append-content` |
| `action` | exact | `read`, `write`, `invoke` |
| `notebook` | exact (kernel id) | `20220305173526-4yjl33h` |
| `path` | glob (id-based path) | `/20260107143325-zbrtqup/**` |

Three effects: `deny` = hard block (exit code 5), `allow` = pass, `approval` = pause and wait for human sign-off via the Approval Center.

Order is the only priority mechanism — there is no implicit "deny beats allow". Put more specific rules before broader ones.

### Two-phase evaluation

Permission checks happen in two stages:

1. **Phase 1 (caller check)** — Only `endpoint`, `tool`, and `action` are known. Rules using only these fields produce immediate verdicts.
2. **Phase 2 (content check)** — After payload parsing, block ids in the request are resolved to their owning document's notebook and id-based path. Rules using `notebook` or `path` conditions fire here.

This allows fine-grained policies like "allow the `append-content` tool to write to notebook A, but deny all other writes to notebook A":

```yaml
rules:
  - tool: "append-content"
    notebook: "20260101215354-aaa"
    effect: allow            # ① specific exception, checked first
  - notebook: "20260101215354-aaa"
    action: write
    effect: deny             # ② broad catch-all for the rest
```

### Response filtering

Request interception covers targeted operations (read a specific block, update a specific document). But global read endpoints — `query.sql`, `notebook.lsNotebooks`, etc. — return results across all notebooks. When permission rules restrict access to specific notebooks or paths, the CLI **automatically filters the response**: items from disallowed notebooks/paths are stripped before reaching stdout.

This is not ad-hoc post-processing. Each endpoint schema declares a `guard.response` specification that tells the CLI which fields in the response array map to notebook ids and document paths. The permission engine uses this mapping to evaluate every result item against the same rule chain, removing anything the caller shouldn't see.

In practice: if you deny access to notebook B, a `query.sql` that would normally return rows from notebooks A and B will only show rows from A. The agent never sees restricted data.

### Risk-based auto-approval

Independent of user-configured rules, every endpoint carries a `classification` (mode, surface, scope) that derives a risk label. Destructive or critical operations — batch content deletes, system-level writes, runtime invocations — **automatically require human approval**, even if permission rules say `allow`. This is a built-in safety net.

| Classification | Derived risk |
|---|---|
| `read + meta` | safe |
| `read + content/asset` | sensitive |
| `write + content + single` | elevated |
| `write + content + batch` | destructive (auto-approval) |
| `write + workspace` | critical (auto-approval) |
| `invoke + runtime` | destructive (auto-approval) |

Pass `--yes` to bypass auto-approval (for pure automation). Set `behavior.allowYes: false` in config to disable `--yes` entirely and enforce the Approval Center for all gated operations.

### Approval Center

When an operation triggers approval, the CLI starts a local broker, opens a WebUI in the browser, and waits inline for human sign-off:

<!-- TODO: screenshot — Approval Center WebUI showing a pending approval request -->
![Approval Center](asset/approval-center.png)

You can also manage approvals from the terminal:

```bash
siyuan approval status           # broker status
siyuan approval list             # pending and recent requests
siyuan approval approve <id>     # approve from terminal
siyuan approval reject <id>      # reject from terminal
siyuan approval open             # open the WebUI manually
```

The broker starts lazily on the first gated write, stays alive while requests are pending, and shuts down after an idle timeout.

### Debugging permissions

```bash
siyuan workspace which           # see resolved workspace + full rule list
siyuan api <id> --dry-run        # preview: shows wouldRequestApproval
siyuan api <id> --debug          # print curl-equivalent to stderr
```

Error codes are specific: `ENDPOINT_DENIED` (rule blocked the endpoint) and `CONTENT_DENIED` (rule blocked the target notebook/path) both include the matching rule index for diagnosis. For the full permission rule reference, run `siyuan doc read permission`.

---

## User Extensions

You can add custom API endpoints and workflow tools without modifying the source code. Extensions live in `~/.config/siyuan-cli/extensions/` and are written in TypeScript, loaded via `jiti` at execution time:

```bash
siyuan extension init          # scaffold the directory with tsconfig.json and examples
siyuan extension list          # show discovered extensions + cache status
siyuan extension cache         # batch-generate schema.json caches
```

### API extension example

Create `~/.config/siyuan-cli/extensions/apis/echo.ts`:

```ts
import type { EndpointSchema } from "@frostime/siyuan-cli/schema";

export const schema: EndpointSchema = {
  endpoint: "/api/custom/echo",
  summary: "Echo payload back",
  payload: {
    type: "object",
    properties: { text: { type: "string", description: "Text to echo" } },
    required: ["text"]
  },
  classification: { mode: "read", surface: "meta", scope: "single" }
};
```

```bash
siyuan extension cache
siyuan api custom.echo --text "hello"
```

### Tool extension example

Create `~/.config/siyuan-cli/extensions/tools/hello.ts`:

```ts
import type { ToolSchema } from "@frostime/siyuan-cli/schema";

export const tool: ToolSchema = {
  id: "hello-ext",
  summary: "Greet someone",
  input: {
    type: "object",
    properties: { name: { type: "string", description: "Name to greet" } }
  },
  async run(_ctx, input) {
    const { name = "world" } = input as { name?: string };
    return { content: `Hello, ${name}!` };
  }
};
```

```bash
siyuan extension cache
siyuan tool hello-ext --name Alice
```

Extensions get the same CLI surface as built-ins: parameter validation, `--help`, `--dry-run`, permission checks, and output formatting. Tool extensions receive a `ToolContext` with `callEndpoint()` for calling registered endpoints (with full permission and guard logic) and `callEndpointRaw()` for calling arbitrary kernel paths directly.

For the full authoring guide: `siyuan doc read cli-usage/extension`.

---

## Agent Integration

### Built-in docs

The CLI ships a complete reference doc set on disk. Agents can discover and read it without leaving the terminal:

```bash
siyuan doc list                          # list all docs with file paths and summaries
siyuan doc read README.md                # read a doc by path or unique name
siyuan doc read recipes/edit-content.md  # task-oriented operation recipes
```

The docs root path is printed by `siyuan --help`, so agents with file system access can read files directly without going through the CLI.

The doc set is organized in three layers:

| Layer | Path | Covers |
|-------|------|--------|
| SiYuan domain knowledge | `siyuan-guide/` | Block data model, path semantics (id vs hpath), SQL query strategy, daily note model |
| CLI usage reference | `cli-usage/` | Full command tree, global flags, input sources, permission config, extension authoring, error codes |
| Task recipes | `recipes/` | Step-by-step workflows: connect workspace, find documents, read content, safely edit content |

### Agent SKILL

Install a compact SKILL file into your coding agent's config directory:

```bash
siyuan skill install                    # default: ~/.agents/skills/
siyuan skill install --target claude    # → ~/.claude/skills/
siyuan skill install --target .pi --local  # → ./.pi/skills/ (project-local)
```

The SKILL serves as the entry point for agent discovery — it tells the agent what `siyuan-cli` is, introduces SiYuan's block-centric data model, and points to the built-in docs for detailed reference. Once installed, agents operating in that environment will recognize and use the CLI when tasks involve SiYuan.

You don't need to memorize every command or flag. The CLI is designed for self-guided discovery: `--help` on any command, `siyuan doc list` for the full doc index, and `siyuan doc read <topic>` when you need depth. In agent scenarios, let the agent read the docs itself.

---

## Installation

```bash
# npm
npm install -g @frostime/siyuan-cli

# pnpm
pnpm add -g @frostime/siyuan-cli
```

Requires **Node.js ≥ 20**.

## Others

### Windows Git Bash / MSYS note

Arguments starting with `/` may be rewritten into Windows paths by the shell before reaching the CLI. This affects SiYuan virtual paths like `--hpath "/TestDoc"`. Two workarounds:

```bash
# Disable path conversion for this command
MSYS_NO_PATHCONV=1 siyuan tool resolve-path --hpath "/TestDoc"

# Or use double-slash as a Git Bash / MSYS escape
siyuan tool resolve-path --hpath //TestDoc
```

---

## License

[GPL-3.0](LICENSE) · GitHub: https://github.com/frostime/siyuan-cli

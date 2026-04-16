---
change: "p1-foundation"
change-type: single
updated: "2026-04-17"
---

# Tasks · P1: Foundation

## Phase 1: Project Skeleton (M0)

**Goal**: `siyuan --version` 和 `siyuan --help` 有输出，构建链路打通。

- [x] T1.1 替换 `package.json`（name=siyuan-cli，补全 deps/scripts）
- [x] T1.2 替换 `tsconfig.json`（ESNext + Bundler moduleResolution）
- [x] T1.3 新建 `bin/siyuan.mjs`（shebang 入口）
- [x] T1.4 从 skeleton 落库 `src/core/schema.ts`（全局类型锚）
- [x] T1.5 新建 `src/utils/errors.ts`（结构化错误 + exit code，见 design.md §4）
- [x] T1.6 新建 `src/utils/paths.ts`（XDG / %APPDATA% 跨平台路径）
- [x] T1.7 新建 `src/cli.ts`（Citty 主入口，--version，空 workspace 命令占位）
- [x] T1.8 `pnpm install` + `pnpm build` 验证构建通过

**Verify**: `node bin/siyuan.mjs --version` 打印版本号；`node bin/siyuan.mjs --help` 有输出。

---

## Phase 2: Config + Client (M1 基础设施)

**Goal**: config.yaml 读写正常，SiyuanClient ping 可用。

- [x] T2.1 新建 `src/core/config.ts`（loadConfig / saveConfig / resolveWorkspace，见 design.md §3）
- [x] T2.2 新建 `src/core/client.ts`（SiyuanClient：call / upload / ping，见 design.md §2）

**Verify**: 手写一个 `scripts/smoke-config.ts`，loadConfig → saveConfig → loadConfig 循环不丢数据（或直接在实现后用 node -e 验证）。

---

## Phase 3: Workspace Commands (M1 命令层)

**Goal**: workspace 6 个子命令全部可用。

- [x] T3.1 新建 `src/commands/workspace.ts`（add / list / use / verify / remove / show）
- [x] T3.2 新建 `src/commands/index.ts`（汇总注册，接入 cli.ts）
- [x] T3.3 `src/cli.ts` 接入 workspace 命令（替换占位）
- [x] T3.4 Unix chmod 0600 写入 config.yaml

**Verify**:
```bash
node bin/siyuan.mjs workspace add main --url http://127.0.0.1:6806
node bin/siyuan.mjs workspace list          # JSON 含 main
node bin/siyuan.mjs workspace verify main   # { ok: true, version: "..." }
node bin/siyuan.mjs workspace use main
node bin/siyuan.mjs workspace show
node bin/siyuan.mjs workspace remove main
```
错误场景：连接失败 → stderr JSON + exit code 3；无 workspace 时命令运行 → exit code 2。

---

## Progress

**Overall**: 11 / 11 tasks ✅

| Phase | Done | Total | Status |
|-------|------|-------|--------|
| P1: Skeleton | 8 | 8 | ✅ |
| P2: Config + Client | 2 | 2 | ✅ |
| P3: Workspace Commands | 4 | 4 | ✅ |

**Recent**: [2026-04-17] 全部 11 tasks 完成，M0+M1 验证通过

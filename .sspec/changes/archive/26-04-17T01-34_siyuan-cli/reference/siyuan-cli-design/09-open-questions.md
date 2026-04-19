# 09 · 未决议问题

> 本篇要回答什么：哪些决策需要人类拍板？每个问题列出选项 + 权衡 + 推荐。

## Q1：Token 落盘方案

**问题**：workspace token 怎么存？

**选项**：

| 方案 | 实现复杂度 | 安全性 | Agent 兼容性 | 推荐度 |
| --- | --- | --- | --- | --- |
| 明文 yaml + chmod 0600 | 最低 | 依赖文件系统权限 | ✅ 最好 | ★★★ 默认 |
| `tokenSource: { type: env }` | 低 | 环境变量级 | ✅ 好 | ★★★ 次选 |
| `tokenSource: { type: command }`（对接 `pass` / `op`） | 中 | 高 | 🟡 需要配置 | ★★ 进阶 |
| `keytar` OS keychain | 高（native 依赖） | 最高 | ❌ Docker / headless 不可用 | ★ 不推荐 |

**推荐**：默认明文 + 0600，同时支持 `tokenSource`。不引入 keytar。

**需要拍板**：是否同意该方案？是否需要文件明文以外的 **必须** 选项？

---

## Q2：是否提供交互式（TUI）模式

**问题**：某些场景用户可能手动跑 CLI（比如配置初次化）。要不要 TUI？

**选项**：

- A. **不做**：坚持 Agent-first，`-i` 只是开 `$EDITOR` 编辑 JSON 占位
- B. **最小 TUI**：只对 `workspace add` 提供逐项 prompt（其他命令一律 Agent 友好）
- C. **完整 TUI**：用 `@clack/prompts` 提供多命令的交互入口

**推荐**：A。

**理由**：TUI 会诱导开发者把交互作为默认路径，破坏 "所有参数都能靠 flag / 文件 / stdin 传入" 的原则；`--interactive` 打开 $EDITOR 编辑空 JSON 对 CLI 调试足够。

**需要拍板**：是否同意 A？

---

## Q3：用户自定义 Tool 的加载机制

**问题**：v0.3+ 考虑允许用户加自己的 Tool，怎么做才安全？

**选项**：

- A. **只接 bash alias**（`~/.config/siyuan-cli/aliases.yaml`，内容是 shell script）—— 安全性由 shell 负责
- B. **动态加载 .js/.ts**：用 Node 的 `import()` —— 便捷但用户可能误装恶意包
- C. **加载 WASM 模块**：沙箱隔离 —— 复杂度过高
- D. **不开放**：用户想要就 fork 代码

**推荐**：v1.0 前只做 A，v1.1+ 再考虑 B 并加签名校验。

**需要拍板**：是否同意 A？

---

## Q4：是否内置 SQL 速查表 / 块类型表作为 Skill reference

**问题**：Skill 的 `references/` 放什么？

**选项**：

- A. **不放**：Skill 只讲命令用法，细节参考让 Agent 去读官方文档
- B. **放一份**：内置 `sql-cheatsheet.md` / `block-types.md` / `common-workflows.md`，跟随版本
- C. **放多份**：再加 `api-index.md`（列出所有 endpoint）/ `attr-builtin.md`（内置属性名）

**推荐**：B。

**理由**：

- Agent 每次从 zero 搜索很耗 token
- 块类型（`d/p/h/l/i/c/t/b/s/html/code/query_embed/widget/...`）的解释一般 Agent 靠猜容易出错
- SQL 表结构（blocks / attributes / refs / assets / blocks_fts）官方文档有但分散

但也要控制体量：每个 reference 不超过 200 行，保持精简。

**需要拍板**：是否同意 B？放哪几篇？

---

## Q5：`@file:<path>` 的路径是绝对还是相对

**问题**：`--data @file:./note.md` 的 `./note.md` 相对于什么？

**选项**：

- A. 相对 CWD（当前 shell 工作目录）—— Unix 惯例
- B. 相对 config.yaml 所在目录
- C. 相对 CLI 被调用时的某个约定根

**推荐**：A（相对 CWD）。

**理由**：Agent 和用户的心智模型都是"我在哪儿跑的命令，相对哪儿"。config 目录与 CWD 无关。

**同时**：对明显的相对路径（不以 `/` 或 `~/` 开头），`--debug` 时打印解析后的绝对路径，方便排查。

**需要拍板**：是否同意 A？

---

## Q6：`siyuan skill install` 是否在覆盖时自动备份

**问题**：`install --force` 会直接覆盖目标目录，是否备份？

**选项**：

- A. 不备份（`--force` 就是 force）
- B. 自动备份到同级 `<n>.bak-YYYYMMDDHHmmss/`
- C. `--backup` flag 可选

**推荐**：C。默认不备份，提供可选项。

**理由**：Skill 目录有本地修改的用户通常会用 git 管理，自动备份反而制造垃圾；但给个 flag 留口子。

**需要拍板**：是否同意 C？

---

## Q7：API endpoint 的 id 派生规则

**问题**：从 `/api/<group>/<n>` 派生 `<group>.<n>`，但有些边缘情况——

- `/api/av/addAttributeViewBlocks` → `av.addAttributeViewBlocks`（OK）
- `/api/attr/getBlockAttrs` → `attr.getBlockAttrs`（OK）
- `/api/outline/getDocOutline` → `outline.getDocOutline`（OK）

所有已知 endpoint 都符合 `/api/<token1>/<token2>` 两段式，派生无歧义。

**需要拍板**：是否承诺"不支持三段式 endpoint（如 `/api/x/y/z`）"？若思源未来出现三段式，派生规则如何扩展？

**推荐**：一期承诺只支持两段式。未来出现三段式时，id 用 `x.y.z` 形式（点号为 group 分隔符，扩展时保持一致）。配置里的 glob 匹配仍用 micromatch，`x.y.*` 能命中 `x.y.z`。

---

## Q8：CLI 版本号与思源 kernel 版本的绑定

**问题**：如果 kernel API 在某版本变了（加字段、改语义），CLI 怎么应对？

**选项**：

- A. **不绑定**：用户自己负责 schema 与 kernel 对齐
- B. **记录 minKernelVersion**：schema 里声明，运行时对比 `/api/system/version`，不匹配发 warning
- C. **分支维护**：CLI 版本号跟随 kernel（`siyuan-cli@3.6.*` 对应 kernel `3.6.*`）

**推荐**：B。

**理由**：A 风险太大，C 维护成本高。B 的 warning 对 Agent 和人都是轻量提示。

**需要拍板**：是否同意 B？warning 是否影响 exit code（建议不影响，只是 stderr）？

---

## Q9：是否默认启用遥测

**问题**：v1.0 发版时要不要收集匿名使用数据？

**推荐**：**不**。不内置任何遥测。思源笔记的用户对隐私敏感，且本 CLI 操作的是本地知识库，任何遥测都会引发不信任。

**需要拍板**：是否同意彻底不做遥测？

---

## 附：拍板流程建议

建议人类评审时对 Q1–Q9 逐项给出 "同意推荐 / 改为 X / 需要进一步讨论"，Agent 收到回复后把结论写回 README 的 "决策快照"。未拍板项在代码里用 `// TODO(open-questions.md#QX)` 标注。

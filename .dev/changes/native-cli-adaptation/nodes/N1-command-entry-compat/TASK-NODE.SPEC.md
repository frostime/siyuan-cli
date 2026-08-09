# N1：最小可用的命令入口兼容改造

- **状态**：`awaiting_review`
- **执行者**：Pi 执行 Agent（N1）
- **上游目标**：`../../native-cli-adaptation.SPEC.md`
- **协作规则**：`../../THIS.RULE.md`

## 任务目的

解决本项目全局 `siyuan` 命令与 SiYuan 3.7.0 起官方原生 CLI 的名称冲突，同时保留旧版 SiYuan 环境和既有调用方的兼容路径。N1 完成后应构成整个 change 的最小可用交付，可独立准备发布。

## 已确认的行为契约

- npm package 同时发布两个 bin：
  - `siyuan-cli`：规范命令；
  - `siyuan`：兼容别名。
- 两个 bin 在确实解析到本 package 时运行相同 CLI 和子命令。
- SKILL、README、内置文档、CLI 帮助、示例和错误提示统一使用 `siyuan-cli`。
- `siyuan` 只在兼容说明、迁移说明、原生 CLI 描述、package bin 声明，以及项目内 `pnpm run siyuan ...` 中保留。
- SiYuan `<3.7.0` 环境中，两种入口均可使用本项目。
- SiYuan `>=3.7.0` 环境中，裸命令 `siyuan` 的 PATH 解析结果不受本项目保证；用户和 Agent 必须使用 `siyuan-cli`。
- 项目内 npm script 名 `siyuan` 和 `bin/siyuan.mjs` 内部文件名可以保持不变。

## 实施范围

1. 调整 package bin 声明，使安装包同时生成 `siyuan-cli` 和 `siyuan`。
2. 将 CLI 根命令身份及依赖根命令名的帮助路由改为 `siyuan-cli`，避免散落多个不一致常量。
3. 审计所有面向用户的命令字符串，包括源码中的帮助、错误和提示。
4. 更新仓库内 `skills/siyuan-cli/`、`src/docs/`、README 和其他随 package 发布的材料。
5. 增加清晰、简短的迁移和版本兼容说明。
6. 更新受影响测试，并补充对双 bin 与规范命令显示的必要验证。
7. 检查打包产物，确认两个显式 bin 入口均调用本项目，而不是依赖当前机器 PATH 中的 `siyuan`。

## 非目标

- 不新增、删除或改变 API endpoint 与 tool 行为。
- 不实现 native backend、SiYuan 版本探测或 N2 能力。
- 不实现 `serve` 或任何内核进程管理。
- 不处理 npm 上其他同名 package 的兼容或共存。
- 不实际发布 npm package。
- 不擅自决定发布版本号；若仓库没有已确认版本，保留为发布阶段决策。发布说明仍需明确这是 breaking command migration。
- 不修改全局安装的 SKILL 分发副本。

## 大致实现方案

- `package.json` 的 `bin` 同时映射 `siyuan-cli` 与 `siyuan` 到现有 launcher；保留 `scripts.siyuan`。
- CLI 内部以一个规范名称作为根命令 meta 和帮助路由判断依据。
- 对命令引用做语义审计，而不是全局盲替换：产品名称 SiYuan、官方原生命令、兼容说明和本地开发 script 不应误改。
- 用现有测试覆盖源码行为，再通过隔离的临时安装目录验证 package bin；不要依赖当前 PATH 顺序。

## 验收条件

- [x] package 安装后同时提供 `siyuan-cli` 与 `siyuan` 两个 bin。
- [x] 两个显式 package bin 的 `--version` 和主要子命令帮助均来自本项目。
- [x] CLI 根帮助显示规范名称 `siyuan-cli`。
- [x] `siyuan-cli api -h`、`tool -h`、`extension -h` 及 endpoint/tool 细分帮助仍走现有自定义帮助逻辑。
- [x] SKILL、内置文档、README、源码帮助和错误提示中的本项目调用统一使用 `siyuan-cli`。
- [x] 残留 `siyuan` 命中均属于兼容说明、官方原生 CLI、package bin、本地 `pnpm run siyuan ...` 或其他明确合理场景。
- [x] 迁移说明明确 SiYuan `<3.7.0` 与 `>=3.7.0` 的行为边界。
- [x] `pnpm run typecheck`、`pnpm test`、`pnpm run build` 通过。
- [x] 隔离的 package 安装/pack smoke test 通过；不修改机器全局 npm 安装。
- [x] 不访问任何 SiYuan workspace。

## 执行要求

1. 开始时将状态改为 `in_progress` 并填写执行者标识。
2. 先核对实际引用面和测试，再实施；不以旧 MAP 的行号作为事实。
3. 若发现会改变上述行为契约的问题，改为 `blocked` 并直接向用户确认。
4. 完成后将状态改为 `awaiting_review`，填写下方结果，等待主 Agent验收。

## 结果与影响

> 由执行 Agent 完成后填写。

- **实际改动**：
  - `package.json` 现将 `siyuan-cli`（规范入口）和 `siyuan`（兼容别名）同时映射到 `bin/siyuan.mjs`；项目内 `scripts.siyuan` 与 launcher 文件名保持不变。
  - `src/cli.ts` 以单一 `CLI_NAME = 'siyuan-cli'` 作为根命令身份和根级自定义帮助路由判断依据；根帮助、API/tool/extension 分组帮助及 endpoint/tool 细分帮助均显示规范命令。
  - 源码帮助、错误、提示、endpoint/tool 示例，以及 `skills/siyuan-cli/`、`src/docs/`、README、项目级示例和贡献者文档中的本项目调用已改为 `siyuan-cli`；仓库开发用的 npm script 名 `siyuan` 保持不变。
  - 验收修复：将 bundled `src/docs/cli-usage/cli-overview.md` 中五个 MSYS 安装用户示例由 `pnpm run siyuan ...` 改为 `siyuan-cli ...`。
  - README、SKILL 与 CHANGELOG 增加迁移信息：SiYuan `<3.7.0` 可使用两个 package 入口；SiYuan `>=3.7.0` 时裸 `siyuan` 可能解析到官方原生 CLI，应使用 `siyuan-cli`。
  - 新增 `tests/cli-entry.test.ts`，验证双 bin 声明、规范根帮助，以及 API/tool/extension 和细分帮助路由；同步更新已有扩展提示断言。
- **验证命令与结果**：
  - `pnpm run typecheck`：通过。
  - `pnpm test`：通过，99/99；之后仅格式化新增测试文件，并再次运行 `pnpm exec tsx --test tests/cli-entry.test.ts`，3/3 通过。
  - `pnpm run build`：通过；仅有 rolldown plugin timing 警告。
  - 验收修复后运行 `pnpm exec tsx --test tests/doc-and-skill.test.ts tests/cli-entry.test.ts`：通过，14/14。
  - 隔离 package smoke test：通过。使用 `pnpm pack` 输出到临时目录、`npm install --ignore-scripts --prefix <temp>` 安装 tarball；临时安装中的显式 `siyuan-cli` 与 `siyuan` bin 均返回版本 `0.15.4`，两者的 `api -h` 均来自本项目且显示 `siyuan-cli`；另验证规范入口的 `tool -h`、`extension -h`、`api query.sql --help`、`tool get-block-content --help`。临时目录已删除，未修改全局安装。
  - 残留审计：重新以 `rg` 检查 bundled docs、SKILL 和 README；已无 `pnpm run siyuan`，剩余非 `siyuan-cli` 的小写 `siyuan` 命中均属于兼容/原生 CLI 说明、SiYuan URL/协议/路径/密钥标签或文档目录名。仓库其余残留另包括 package bin、本地 npm script、内部 header、临时目录命名或 launcher 文件名。
  - 全程未访问任何 SiYuan workspace。
- **未运行项目**：无节点要求的未运行验证项。
- **偏离契约**：无。
- **残余风险**：裸 `siyuan` 的实际解析仍由用户机器 PATH 顺序决定，符合既定不保证边界；未在真实全局 npm 环境安装（按契约仅做隔离安装）。
- **对 N2 / 总 SPEC 的影响**：N1 已形成可独立准备发布的最小交付；N2 可继续以 `siyuan-cli` 为本 package 的规范入口，无需依赖或改变双 bin 兼容策略。

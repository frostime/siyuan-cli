## Project-local rules

- CLI 内部文档、提示使用英文。
- 在本 repo 内运行 self CLI 时，使用 `pnpm run siyuan ...`。
- 不要用全局 `siyuan` 代替本地开发版；全局安装可能不是最新代码。

## Key paths

- 项目代码：`src/`
- CLI 内置文档：`src/docs/`（随 package 发布）
- CLI 内置 SKILL：`skills/`（install 后落在全局 `~/.agents/skills/`）
- 已安装 package 视角：运行时代码与类型声明看同 package 下的 `dist/`

## 安装本项目的 Agent 使用者视角

- 先看 `siyuan-cli` SKILL
- 再运行 `pnpm run siyuan --help`
- CLI 会继续引导 Agent 查看内置文档，以及同 package 下 `dist/` 中的运行时代码

## Test CLI

本项目应当使用 `dev` 的思源空间开发测试，避免访问用户主空间。
测试过程中若 dev workspace 未启动，应当告知用户，要求他启动。

## Gotchas

- When editing the siyuan-cli skill, edit `<cwd>/skills/siyuan-cli` (source) instead of `~/.agents/skills/...` (distribution)  

---


## Agent Document

Read `.dev/project.md` before project-specific work on cold start.

Read `.dev/docs/` for project-wise development documentation.

## Change Based Development

Place change dir under `.dev/changes/<slug>` if user instructs.

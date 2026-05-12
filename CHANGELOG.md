# Changelog

All notable changes to `@frostime/siyuan-cli` are documented here.

## Unreleased

- `get-block-content` 新增 `--bodyOnly true`，用于输出无 header 的干净 Markdown body
- `brute-edit` 新增 `--overwrite @file:/path.md` / `@stdin` 整文档覆盖模式，保留文档 ID
- 移除内置 `push-md` tool；新建文档使用 `filetree.createDocWithMd` / `import.importStdMd`，覆盖已有文档使用 `brute-edit --overwrite`

## [0.12.3] — 2026-05-07

- `--print json` 输出统一为信封模式，approval 诊断信息走 stderr
- `brute-edit` 支持 `@stdin` 输入
- fix: `moveBlock` 文档用法修正
- fix: `get-block-info` CLI 参数与 `getChildBlocks` 响应守卫

## [0.12.0] — 2026-05-07

- 内置 SKILL 新增 `batchUpdateBlock`
- sspec 工具链更新
- spec-doc 审计修正

## [0.11.3] — 2026-05-06

- permission 规则新增 `root_id` 字段，`.sy` 后缀写入时发出警告

## [0.11.2] — 2026-05-06

- fix: permission 审批门控穿透资源级授权检查
- SKILL 支持版本号标记

## [0.11.0] — 2026-05-05

- 新增 `brute-edit` 和 `push-md` 写入工具
- fix: `workspace verify` 用法修正

## [0.10.2] — 2026-05-05

- permission 审批流程完善
- 文档整理与 README 更新

## [0.10.0] — 2026-05-04

- 初始功能集：workspace 管理、kernel API 代理、工具链、agent skill 安装

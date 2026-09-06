# Changelog

All notable changes to `@frostime/siyuan-cli` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Workspace selection can be bound to the calling process. `siyuan-cli current bind <workspace>` followed by `siyuan-cli current confirm <nonce>` in a second, independent call attaches a catalog workspace to the caller's own OS process scope — an Agent runtime or a live shell — so later `api` and `tool` calls in that scope need no `--workspace` and do not disturb anyone else's default. The binding ends when that process exits. It is process-scoped selection, not logical session identity: callers that share one OS process share the binding, so use explicit `--workspace` or a project file when finer separation is required. A project file and a binding that name different workspaces is an error, never a silent winner.
- `siyuan-cli skill install` now remembers each global install location in the CLI config dir. A bare `skill install` refreshes every recorded location that still exists — after a CLI upgrade one command realigns `~/.agents`, `~/.claude`, and any other agent already on the machine — and falls back to the default `agents` install when nothing is recorded. `--agent` installs one location and keeps the other records. Project-scope installs (`--project`) are deliberately not recorded, since they belong to a single checkout. The skill-version mismatch warning names the install path it checked.
- New `siyuan-cli skill targets` lists every known agent, where it loads skills from in project and global scope, and what is installed there.

### Changed

- **Breaking:** `siyuan-cli skill install` / `skill uninstall` select a location with `--agent <id>` plus `--global` / `--project` instead of `--target <dir-name>` plus `--local`. `--agent` accepts a fixed set of ids (`agents`, `claude-code`, `codex`, `cursor`, `gemini-cli`, `github-copilot`, `opencode`, `pi`) whose project and global directories follow the mapping used by the `skills` installer, so an unknown name fails with the valid list instead of installing into a made-up directory — notably `--agent pi` writes `~/.pi/agent/skills`, where pi actually looks, rather than `~/.pi/skills`. Both removed flags fail with `SKILL_FLAG_REMOVED` instead of being silently ignored (the guard can go away after one release). `skill uninstall` no longer fails on a location that was never installed; it reports `absent`.
- **Breaking:** the commands that decide *which workspace a call uses* moved out of `workspace` into a new top-level `current` subcommand. `workspace` now covers only the catalog (`add` / `list` / `show` / `remove`) and named connection checks; `current` owns selection (`bind` / `confirm` / `unbind` / `global` / `which` / `verify`). `workspace use` and `workspace which` still run as deprecated aliases.
- **Breaking:** `workspace verify` now verifies named catalog entries (`workspace verify <name>` / `--all`). Checking the workspace this call would actually resolve to is `current verify`; a bare `workspace verify` no longer means that and instead reports the ambiguity with both forms.

### Removed

- **Breaking:** the built-in docs no longer exist as a separate `doc` command; all guidance now ships inside the bundled agent skill. `siyuan-cli skill read` returns the skill (with a manifest of bundled resources, e.g. former docs such as `recipes/find-target.md`), `siyuan-cli skill read <path>` reads one resource, and `siyuan-cli skill list` enumerates resources. The skill works in three interchangeable modes: read on demand via the CLI without installing anything, install it with `siyuan-cli skill install`, or install the published skill from GitHub with external skill managers.

- Removed `workspace verify --global-current`. Use `current verify`.

## [0.16.0] - 2026-08-10

### Added

- Added the `history.createDocHistory` Kernel endpoint. It requires SiYuan Kernel `3.7.0` or newer, and the CLI now enforces declared minimum Kernel versions before requests.
- Upgraded `checkpoint-doc` to create both a Kernel document history entry and a local recovery package. Dry-run previews permission and approval behavior without writing either layer, and partial failures report the state of both layers.

### Changed

- **Breaking:** `siyuan-cli` is now the canonical command. `siyuan` remains a compatibility alias, but on SiYuan `3.7.0` or newer a bare `siyuan` command may resolve to SiYuan's native CLI instead.
- On older Kernels without document history support, `checkpoint-doc` creates the local recovery package and reports the missing Kernel layer instead of silently claiming a complete checkpoint.

### Fixed

- Fixed `workspaceDir` auto-resolution by reading the configured local port and verifying the runtime workspace through `getWorkspaceInfo`, rather than relying on the masked `getConf` workspace field.

## [0.15.4] - 2026-05-25

### Added

- Added `get-block-content --bodyOnly true` for clean Markdown body output without a document header.
- Added full-document overwrite support to `brute-edit` via `--overwrite @file:/path.md` and `@stdin`, while preserving the document ID.

### Removed

- Removed the built-in `push-md` tool. Use `filetree.createDocWithMd` or `import.importStdMd` for new documents, and `brute-edit --overwrite` for existing documents.

## [0.12.3] - 2026-05-07

### Added

- Added `@stdin` input support to `brute-edit`.

### Changed

- Standardized `--print json` output as an envelope and moved approval diagnostics to stderr.

### Fixed

- Corrected the `moveBlock` documentation usage.
- Corrected `get-block-info` CLI parameters and the `getChildBlocks` response guard.

## [0.12.0] - 2026-05-07

### Added

- Added `batchUpdateBlock` to the bundled SKILL.

## [0.11.3] - 2026-05-06

### Added

- Added the `root_id` permission rule alias, normalized to an ID-based `.sy` path.

## [0.11.2] - 2026-05-06

### Added

- Added version markers for the bundled SKILL.

### Fixed

- Fixed permission approval handling across resource-level authorization checks.

## [0.11.0] - 2026-05-05

### Added

- Added the `brute-edit` and `push-md` write tools.

### Fixed

- Corrected `workspace verify` usage.

## [0.10.2] - 2026-05-05

### Changed

- Improved the permission approval workflow.
- Reorganized project documentation and the README.

## [0.10.0] - 2026-05-04

### Added

- Initial feature set: workspace management, Kernel API proxying, workflow tools, and Agent SKILL installation.

[Unreleased]: https://github.com/frostime/siyuan-cli/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/frostime/siyuan-cli/compare/v0.15.4...v0.16.0
[0.15.4]: https://github.com/frostime/siyuan-cli/compare/v0.15.3...v0.15.4
[0.12.3]: https://github.com/frostime/siyuan-cli/compare/v0.12.0...v0.12.3
[0.12.0]: https://github.com/frostime/siyuan-cli/compare/v0.11.3...v0.12.0
[0.11.3]: https://github.com/frostime/siyuan-cli/compare/v0.11.2...v0.11.3
[0.11.2]: https://github.com/frostime/siyuan-cli/compare/v0.11.0...v0.11.2
[0.11.0]: https://github.com/frostime/siyuan-cli/compare/v0.10.2...v0.11.0
[0.10.2]: https://github.com/frostime/siyuan-cli/compare/v0.10.0...v0.10.2
[0.10.0]: https://github.com/frostime/siyuan-cli/releases/tag/v0.10.0

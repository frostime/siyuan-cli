# Changelog

All notable changes to `@frostime/siyuan-cli` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.17.0-dev.3] - 2026-09-08

### Changed

- Agent skill resources restructured: workspace selection merged into a single `recipes/workspace.md` entry with conditional handoff to `cli-usage/process-binding.md`; `document-tree-and-paths.md` merged into `siyuan-block.md`; `current.md` and `connect-workspace.md` removed.
- Added `cli-usage/read-source.md` as last-resort reference for reading installed package source when `--help` and structured errors are insufficient.
- `SKILL.md` compressed 10.6% (9.9 KB → 8.8 KB) by replacing prose with flowchart form, dropping procedural demonstrations, and tightening phrasing. All decision gates and safety contracts preserved.

### Fixed

- Corrected embed-block documentation: multi-line queries must use literal `_esc_newline_` token; real newlines cause the block to stay a paragraph instead of becoming `query_embed`.
- Fixed unsafe `$TMPDIR` round-trip recipe that expanded to `rm "/doc.md"` on MSYS (where `TMPDIR` is unset).

### Removed

- Skill-install operator instructions, schema-cache internals, process-observation rationale, and other content an Agent performing content tasks cannot act on.
- Command inventory tables and error-code catalogs already provided by `--help` and runtime structured errors.

## [0.17.0-dev.2] - 2026-09-07

### Added

- Experimental caller-process workspace binding: `current bind <workspace>` plus a separate `current confirm <nonce>` selects the nearest reliable common process scope. Pending confirmation can be retried without extending its expiry or removed with `current cancel <nonce>`; `current unbind` releases confirmed bindings only. Windows native, MSYS2, and Git Bash observation preserves uncertainty and fails before a request rather than silently choosing another workspace. A conflicting project workspace remains an error.
- `siyuan-cli skill install` records its global install locations, so a bare `skill install` refreshes every install on the machine after a CLI upgrade. Project-scope installs (`--project`) are not recorded.
- `siyuan-cli skill targets` lists each known agent, where it loads skills from in project and global scope, and what is installed there.

### Changed

- **Breaking:** workspace selection moved out of `workspace` into a new top-level `current` command (`bind` / `confirm` / `unbind` / `global` / `which` / `verify`). `workspace` now covers only the catalog, and `workspace use` / `workspace which` remain as deprecated aliases.
- **Breaking:** `workspace verify` now verifies named catalog entries (`workspace verify <name>` / `--all`). Checking the workspace a call actually resolves to is `current verify`.
- **Breaking:** `siyuan-cli skill install` / `skill uninstall` choose a location with `--agent <id>` plus `--global` / `--project` instead of `--target <dir-name>` plus `--local`. Agent ids come from a fixed table matching the mapping used by the `skills` installer, so an unknown name is rejected instead of creating a directory.
- The installed-skill version check reports every recorded install location and names the path it checked.

### Removed

- **Breaking:** the built-in `doc` command. All guidance ships inside the bundled agent skill: `siyuan-cli skill read` prints the skill with a manifest of its resources, `siyuan-cli skill read <path>` prints one resource, and `siyuan-cli skill list` enumerates them.
- `workspace verify --global-current`. Use `current verify`.

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

# Merge Built-in Docs into the Skill Surface

Status: accepted · 2026-09-07 · supersedes the two-layer SKILL + doc architecture
LAI: #9 (impl #12 #13 closed; #14 spike open)

## Problem Statement

The CLI currently ships two parallel knowledge artifacts:

- `skills/siyuan-cli/SKILL.md` — a compact routing layer read by agents.
- `src/docs/` — 14 files, ~93 KB, discovered/read via `siyuan-cli doc list/read`.

Agents must go through a CLI subprocess (`doc read`) to read task-level detail even when the skill is installed locally. The split exists for historical reasons; comparable products deliver everything as one skill (progressive disclosure inside the skill, not across two artifacts).

## Approach

Merge the docs corpus into the skill as bundled resources. The skill becomes the single knowledge surface, delivered in three interchangeable modes:

| Mode | Delivery | Version coupling |
|---|---|---|
| 1. Zero-install | Agent runs `siyuan-cli skill read` on demand; CLI returns skill content | Tied to the running binary |
| 2. `skill install` | Recursive copy of the skill dir to an agent skills dir (existing implementation, already multi-file capable) | Version-mismatch warning nudges realignment |
| 3. `npx skills` (vercel-labs) | Pull `skills/siyuan-cli/` from GitHub, register across agent tools | May drift; SKILL.md version-check instruction is the fallback |

The `doc` command is removed entirely.

### Version coupling rule (first-class)

Because mode 3 installs can drift from the running CLI version, version alignment is a top-level SKILL.md rule stated at the very beginning of the body, before any routing content:

> Compare the skill's version with the CLI version you are running (every CLI invocation prints both; the CLI also emits an explicit mismatch warning). If they differ, run `siyuan-cli skill install` and re-read the skill before trusting any routed detail.

Enforcement is two-sided and already exists / is kept:

- CLI side: `checkInstalledSkillVersion` prints a mismatch warning on every invocation against the default install target.
- Skill side: the opening rule above; the XML envelope also carries `version`, making mismatch visible in every `skill read` output even in zero-install mode.

## Layout (single source of truth)

```text
skills/siyuan-cli/
├── SKILL.md              # routing layer, unchanged size class (~9 KB)
├── README.md             # moved from src/docs/README.md
├── cli-usage/            # moved from src/docs/cli-usage/
├── recipes/              # moved from src/docs/recipes/
└── siyuan-guide/         # moved from src/docs/siyuan-guide/
```

- `src/docs/` is deleted. Package `files`/build config updated accordingly.
- Resource frontmatter (`title`/`slug`/`summary`) is retained — it feeds `skill list` and the resource manifest in `skill read` output.

## Command surface

```text
siyuan-cli skill read [path]   # no arg → SKILL.md; with path → one resource
siyuan-cli skill list          # SKILL + all resources: path, title, summary
siyuan-cli skill targets       # known agents, their project/global dirs, what is installed
siyuan-cli skill install / uninstall   # recursive copy, see "Install targets" below
```

`doc` and its subcommands are removed; `--help` "Start here" points to `skill read`.

### `skill read` output format

XML envelope, identical shape in all three modes. Frontmatter is parsed into attributes and stripped from the body.

Reading the skill itself (includes the resource manifest — this is how agents discover what can be read next):

```xml
<skill name="siyuan-cli" version="0.17.0" description="Manage SiYuan Note with the siyuan-cli CLI...">
  <resources>
    <resource path="recipes/find-target.md" description="Locate user-named docs/blocks." />
    <!-- one entry per resource file -->
  </resources>
  …SKILL.md body (frontmatter stripped)…
</skill>
```

Reading one resource — the tag changes, so a resource is never mistaken for the skill itself:

```xml
<skill-resource name="siyuan-cli" version="0.17.0" path="recipes/find-target.md" description="Locate user-named docs/blocks.">
  …file body (frontmatter stripped)…
</skill-resource>
```

- `description` on a resource read comes from the file's frontmatter `summary`.
- Unknown path → structured error listing valid top-level entries (points to `skill list`).
- Path traversal outside the skill dir is rejected (`SKILL_PATH_INVALID`).
- Callers address resources by the **relative path the manifest publishes** (`recipes/find-target.md`). A bare basename is accepted only as an unambiguous-compat convenience and is never taught in SKILL.md or README examples.

### SKILL.md routing rewrite

All routing-table entries change from `siyuan-cli doc read <path>` to `siyuan-cli skill read <path>`. The SKILL.md text teaches exactly this one access path — no "if installed, Read the file directly" branch. Internal self-references inside the moved docs (`doc read/list`) get the same rewrite.

## Install targets and registry (review amendments)

The shipped `--target <dir-name> [--local]` shape conflated two axes and accepted arbitrary names, so `--target .pi` produced `~/.pi/skills` (a path pi never reads) and a typo silently created a directory. Reshaped along the two real axes, with ids and directories copied from the mapping used by vercel-labs/skills so the same names work across installers:

```text
siyuan-cli skill install [--agent <id>...] [--global|--project] [--dry-run]
siyuan-cli skill uninstall [--agent <id>...] [--global|--project]
siyuan-cli skill targets
```

- `--agent` accepts only table ids: `agents` (default), `claude-code`, `codex`, `cursor`, `gemini-cli`, `github-copilot`, `opencode`, `pi`. Each id maps to a project dir and a global dir; unknown ids fail with the valid list. No path input reaches the filesystem unvalidated, so the old target-name validator is gone.
- Scope: `--global` (default) resolves under the home directory, `--project` under the working directory. `--global --project` is a conflict error.
- Repeatable `--agent` (citty collects duplicates into an array) and comma-separated values are both accepted.
- Symlinked installs (`skills`' default) are deliberately not offered: Windows symlinks need extra privilege and the version probe wants one readable copy per install. Copy is the only method.
- Registry: each **global** install records `{ agent, path, installedAt }` in `<configDir>/skill-installs.json`. A bare `skill install` syncs every recorded install whose directory still exists, falling back to the default `agents` id when nothing is on record; `--agent` installs those ids and merges with the existing records.
- **Project-scope installs are not recorded.** They belong to one checkout, not to the machine, so a bare install elsewhere must not rewrite them and the version probe must not report them. Because records are global-only, replaying `agent` alone re-resolves the same path; no scope field is needed.
- `checkInstalledSkillVersion` probes **every** recorded install (not just the first) and names the offending path; with nothing recorded it probes the default `agents` dir as before.
- `--agent` must stay absent-by-default in the CLI arg spec — a default value would make every call explicit and disable the sync path.
- `--target`/`--local` are not aliased, but they are not silently ignored either: citty passes unknown flags through, so both subcommands reject them with `SKILL_FLAG_REMOVED`. The guard is temporary and should be deleted once 0.16 usage has aged out.
- `skill uninstall` without `--agent` removes only the default `agents` install (mass removal by empty args is not the symmetric behavior), and reports `absent` instead of failing when a location was never installed.

## Non-goals

- No runtime mechanism to refresh mode-3 installs; version drift is handled by the first-class version rule in SKILL.md plus the CLI-side mismatch warning.
- No changes to workspace/binding behavior.

## Migration checklist

1. Move `src/docs/**` into `skills/siyuan-cli/`; delete `src/docs/`; adjust package build/files config if needed.
2. Rewrite SKILL.md: open with the version-coupling rule, then routing + bootstrap; rewrite `doc read/list` self-references in moved docs.
3. `skill read`: path argument, XML envelope, frontmatter parsing, traversal guard.
4. `skill list`: enumerate SKILL + resources from frontmatter.
5. Remove `src/doc/` (`command.ts`, `runtime.ts`), unregister in `src/cli.ts`, replace `formatDocsHint` usage with a skill-based hint.
6. Update incidental references: `src/extension/command.ts` hint line, error hints mentioning `doc list/read`, `tests/doc-and-skill.test.ts` + `tests/cli-entry.test.ts`, repo-local `AGENTS.md` / `.dev/` docs, CHANGELOG `[Unreleased]`.
7. Spike (optional, last): run `npx skills add` against the repo to verify mode 3; drop if it does not cooperate.

## Acceptance criteria

- Fresh-agent bootstrap works in zero-install mode: `--help` → `skill read` → resource reads, without ever touching a `doc` command.
- `skill install` copies the full skill dir (SKILL.md + resources) and the version check still works.
- `skill read <unknown>` and traversal attempts fail with structured errors.
- No CLI surface, hint, test, or doc reference to the removed `doc` command remains (`rg` audit).
- Tests updated and green; build passes.

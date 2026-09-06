# Merge Built-in Docs into the Skill Surface

Status: draft · 2026-09-06 · supersedes the two-layer SKILL + doc architecture
LAI: #9

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
siyuan-cli skill install / uninstall   # unchanged behavior (recursive copy)
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

Reading one resource:

```xml
<skill name="siyuan-cli" version="0.17.0" path="recipes/find-target.md" description="Locate user-named docs/blocks.">
  …file body (frontmatter stripped)…
</skill>
```

- `description` on a resource read comes from the file's frontmatter `summary`.
- Unknown path → structured error listing valid top-level entries (points to `skill list`).
- Path traversal outside the skill dir is rejected (`SKILL_PATH_INVALID`).

### SKILL.md routing rewrite

All routing-table entries change from `siyuan-cli doc read <path>` to `siyuan-cli skill read <path>`. The SKILL.md text teaches exactly this one access path — no "if installed, Read the file directly" branch. Internal self-references inside the moved docs (`doc read/list`) get the same rewrite.

## Non-goals

- No change to skill install targets/semantics beyond what already exists.
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

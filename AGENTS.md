## Project-local rules

- CLI-facing text (help output, docs, error messages, skill content) is written in English.
- Never delete `.pi/`, `.claude/`, `.agents/` or anything inside them without explicit permission from user.

## Where things live

- `src/` — CLI source.
- `skills/siyuan-cli/` — the bundled agent skill: `SKILL.md` (entry + routing) plus its resource dirs `cli-usage/`, `recipes/`, `siyuan-guide/`. Built into `dist/skills/siyuan-cli/`.
- `dist/` — installed-package view: runtime code and `*.d.mts` type declarations.
- `.agents/skills/` — project skills (e.g. `siyuan-upstream-debug`).
- `.dev/project.md` — project identity and conventions. `.dev/docs/` — cross-module development docs. `.dev/changes/<slug>/` — tracked workspace per change.
- `lai` — local issue/task tracker for Agent; use it if `lai` command exists. Ignore if not found.

## Commands

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

Run the CLI under development as a built binary:

```bash
pnpm run build && node bin/siyuan.mjs <command>
```

Never substitute the globally installed `siyuan` / `siyuan-cli` — it may be an older release. Test against the `dev` SiYuan workspace only, which `.siyuan-cli.yaml` pins; if it is not running, stop and ask the user to start it.

## Gotchas

- Edit the skill in `skills/siyuan-cli/`, never in an installed copy such as `~/.agents/skills/siyuan-cli/` — `skill install` overwrites those.
- Skill install locations come from the agent table in `src/skill/runtime.ts` (`--agent <id>` with `--global` / `--project`); `siyuan-cli skill targets` prints the result.

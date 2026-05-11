# Revision 001: Clarify doc path resolution in SKILL

## Reason
The SKILL referenced recipe/doc paths as if they were relative to the SKILL directory. That can mislead a fresh Agent into trying local filesystem resolution inside the skill package, which is not how `siyuan doc` works.

## Spec Impact
Add an explicit instruction in `skills/siyuan-cli/SKILL.md`:
- the paths mentioned in the SKILL are not relative to the SKILL file;
- use `siyuan --help` to discover the docs root when needed;
- use `siyuan doc list` / `siyuan doc read <path>` to access the docs;
- do not attempt to derive doc files from the SKILL directory.

## Design Impact
No structural change. This is a wording/guardrail correction inside the existing Agent router.

## Task Impact
No new phase. The SKILL text was updated directly and the revision records the acceptance change.

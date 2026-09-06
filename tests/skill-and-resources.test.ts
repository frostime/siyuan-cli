import test from 'node:test';
import assert from 'node:assert/strict';

import {
    formatSkillHint,
    installSkill,
    listSkillResources,
    normalizeSkillTargetName,
    renderSkillRead,
    resolveBuiltinSkillsDir,
    resolveSkillTargetDir,
    uninstallSkill
} from '../src/skill/runtime.ts';

const originalCwd = process.cwd();

test('listSkillResources enumerates bundled resources with frontmatter summaries', () => {
    const resources = listSkillResources();
    assert.ok(resources.length > 0);
    assert.equal(resources[0]?.relPath, 'README.md');
    assert.ok(resources.some((r) => r.relPath === 'recipes/edit-content.md'));
    assert.ok(resources.every((r) => !r.relPath.endsWith('SKILL.md')));
    assert.ok(resources[0]?.summary);
});

const SKILL_XML = /<skill name="siyuan-cli" version="[^"]+" description="[^"]+">/;

test('renderSkillRead without a path returns the skill envelope with a resource manifest', () => {
    const output = renderSkillRead();
    assert.match(output, SKILL_XML);
    assert.match(output, /<resources>/);
    assert.match(output, /<resource path="recipes\/find-target.md"/);
    assert.match(output, /version="[^"]+"/);
    assert.match(output, /# SiYuan CLI/);
    assert.doesNotMatch(output, /^---/); // frontmatter stripped from body
});

test('renderSkillRead resolves a resource by path and unique basename', () => {
    const byPath = renderSkillRead('recipes/edit-content.md');
    assert.match(byPath, /<skill name="siyuan-cli" version="[^"]+" path="recipes\/edit-content.md"/);
    assert.match(byPath, /# Goal/);
    assert.doesNotMatch(byPath, /<resources>/);

    const byName = renderSkillRead('edit-content');
    assert.match(byName, /path="recipes\/edit-content.md"/);

    assert.throws(
        () => renderSkillRead('no-such-resource'),
        /Skill resource "no-such-resource" not found/
    );
    assert.throws(
        () => renderSkillRead('../../escape.md'),
        /Skill resource .* not found/
    );
});

test('formatSkillHint points at the skill surface', () => {
    const hint = formatSkillHint();
    assert.match(hint, /Skill root/);
    assert.match(hint, /siyuan-cli skill read/);
    assert.doesNotMatch(hint, /doc list|doc read/);
});


test('resolveBuiltinSkillsDir supports both dev and packaged layouts', () => {
    const normalize = (path: string) => path.replace(/\\/g, '/');

    const devRoot = resolveBuiltinSkillsDir('H:/repo/src/skill', (path) =>
        normalize(path) === 'H:/repo/skills'
    );
    assert.equal(normalize(devRoot), 'H:/repo/skills');

    const packagedRoot = resolveBuiltinSkillsDir('H:/repo/dist/skill', (path) =>
        normalize(path) === 'H:/repo/skills'
    );
    assert.equal(normalize(packagedRoot), 'H:/repo/skills');
});

test('normalizeSkillTargetName normalizes generic names to dot-prefixed form', () => {
    assert.equal(normalizeSkillTargetName(undefined), 'agents');
    assert.equal(normalizeSkillTargetName('agents'), 'agents');
    assert.equal(normalizeSkillTargetName('claude'), 'claude');
    assert.equal(normalizeSkillTargetName('pi'), '.pi');
    assert.equal(normalizeSkillTargetName('.pi'), '.pi');
    assert.equal(normalizeSkillTargetName('foo'), '.foo');
});

test('resolveSkillTargetDir handles home and local target resolution', () => {
    const agents = resolveSkillTargetDir();
    assert.match(agents, /[\\/]\.agents[\\/]skills[\\/]siyuan-cli$/);

    const claude = resolveSkillTargetDir({ target: 'claude' });
    assert.match(claude, /[\\/]\.claude[\\/]skills[\\/]siyuan-cli$/);

    const cwd = originalCwd.replace(/\\/g, '/');
    process.chdir(originalCwd);
    const localPi = resolveSkillTargetDir({ target: 'pi', local: true }).replace(
        /\\/g,
        '/'
    );
    assert.match(localPi, /[\/]\.pi[\/]skills[\/]siyuan-cli$/);
    assert.ok(localPi.startsWith(cwd));
});

test('installSkill dry-run reports installed or updated action', () => {
    const preview = installSkill({ dryRun: true });
    assert.equal(preview.dryRun, true);
    assert.match(preview.action, /installed|updated/);
    assert.match(preview.target, /[\\/]\.agents[\\/]skills[\\/]siyuan-cli$/);
    assert.equal(Array.isArray(preview.operations), true);
    assert.deepEqual(preview.operations.map((op) => op.op), ['copy']);
});

test('installSkill dry-run supports a project-local generic target', () => {
    const preview = installSkill({ target: '.pi', local: true, dryRun: true });
    assert.equal(preview.dryRun, true);
    assert.match(preview.target, /[\\/]\.pi[\\/]skills[\\/]siyuan-cli$/);

    assert.throws(
        () => uninstallSkill({ target: '.pi', local: true }),
        /Target does not exist/
    );
});

test('special home-directory targets reject --local', () => {
    assert.throws(
        () => resolveSkillTargetDir({ target: 'agents', local: true }),
        /home directory shortcut/
    );
    assert.throws(
        () => resolveSkillTargetDir({ target: 'claude', local: true }),
        /home directory shortcut/
    );
});

test('unsafe target names are rejected early', () => {
    assert.throws(() => normalizeSkillTargetName('..'), /Invalid skill target/);
    assert.throws(() => normalizeSkillTargetName('../x'), /Invalid skill target/);
    assert.throws(() => normalizeSkillTargetName('.foo/bar'), /Invalid skill target/);
});

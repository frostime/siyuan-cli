import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getDocsRoot,
    listBuiltinDocs,
    readBuiltinDoc,
    resolveBuiltinDoc,
    resolveDocsRoot
} from '../src/doc/runtime.ts';
import {
    installSkill,
    normalizeSkillTargetName,
    readSkill,
    resolveBuiltinSkillsDir,
    resolveSkillTargetDir,
    uninstallSkill
} from '../src/skill/runtime.ts';

const originalCwd = process.cwd();

test('docs root points to shipped docs and listBuiltinDocs includes recipes', () => {
    const root = getDocsRoot();
    assert.match(root, /src[\\/]docs$/);

    const docs = listBuiltinDocs();
    assert.ok(docs.length > 0);
    assert.equal(docs[0]?.relPath, 'README.md');
    assert.ok(docs.some((doc) => doc.relPath === 'recipes/edit-content.md'));
});

test('resolveDocsRoot supports both dev and packaged layouts', () => {
    const normalize = (path: string) => path.replace(/\\/g, '/');

    const devRoot = resolveDocsRoot('H:/repo/src/doc', (path) =>
        normalize(path) === 'H:/repo/src/docs'
    );
    assert.equal(normalize(devRoot), 'H:/repo/src/docs');

    const packagedRoot = resolveDocsRoot('H:/repo/dist/doc', (path) =>
        normalize(path) === 'H:/repo/src/docs'
    );
    assert.equal(normalize(packagedRoot), 'H:/repo/src/docs');
});

test('readBuiltinDoc resolves by relative path and unique basename', () => {
    const byPath = readBuiltinDoc('recipes/edit-content.md');
    assert.equal(byPath.doc.relPath, 'recipes/edit-content.md');
    assert.match(byPath.content, /# Goal/);

    const byName = resolveBuiltinDoc('edit-content');
    assert.equal(byName.relPath, 'recipes/edit-content.md');
});

test('readSkill returns bundled skill content', () => {
    const content = readSkill();
    assert.match(content, /^---/);
    assert.match(content, /# SiYuan CLI/);
    assert.doesNotMatch(content, /Runtime values/);
    assert.doesNotMatch(content, /\{\{cli_version\}\}/);
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

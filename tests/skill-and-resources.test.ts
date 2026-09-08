import test from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { join } from 'pathe';
import { tmpdir } from 'node:os';

import {
    checkInstalledSkillVersion,
    formatSkillHint,
    installSkill,
    listSkillResources,
    readSkillInstalls,
    renderSkillRead,
    resolveBuiltinSkillsDir,
    resolveSkillAgentId,
    resolveSkillTargetDir,
    skillAgentIds,
    uninstallSkill
} from '../src/skill/runtime.ts';

const originalCwd = process.cwd();

test('listSkillResources enumerates bundled resources with frontmatter summaries', () => {
    const resources = listSkillResources();
    assert.ok(resources.length > 0);
    assert.equal(resources[0]?.relPath, 'recipes/edit-content.md'); // recipes lead alphabetically
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
    assert.match(
        byPath,
        /<skill-resource name="siyuan-cli" version="[^"]+" path="recipes\/edit-content.md"/
    );
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

test('resolveSkillAgentId accepts table ids only', () => {
    assert.equal(resolveSkillAgentId('pi'), 'pi');
    assert.equal(resolveSkillAgentId(' Claude-Code '), 'claude-code');
    assert.ok(skillAgentIds().includes('claude-code'));

    // Unknown names never become a directory: they fail with the valid list.
    assert.throws(() => resolveSkillAgentId('foo'), /Unknown skill agent: "foo"/);
    assert.throws(() => resolveSkillAgentId('../evil'), /Unknown skill agent/);
});

test('resolveSkillTargetDir maps agent and scope to skill directories', () => {
    withSkillSandbox(({ home, project }) => {
        assert.equal(
            resolveSkillTargetDir('agents', 'global'),
            installedSkillDir(home, '.agents')
        );
        // pi reads global skills from ~/.pi/agent/skills, not ~/.pi/skills.
        assert.equal(
            resolveSkillTargetDir('pi', 'global'),
            installedSkillDir(home, join('.pi', 'agent'))
        );
        assert.equal(
            resolveSkillTargetDir('pi', 'project'),
            installedSkillDir(project, '.pi')
        );
        // Most agents share the project-level .agents/skills directory.
        assert.equal(
            resolveSkillTargetDir('codex', 'project'),
            resolveSkillTargetDir('cursor', 'project')
        );
    });
});

// Install/uninstall tests run against a throwaway home and project directory
// so they never touch the developer's real skill locations.
function withSkillSandbox(
    run: (paths: { home: string; project: string; configDir: string }) => void
): void {
    const home = mkdtempSync(join(tmpdir(), 'siyuan-skill-home-'));
    const project = mkdtempSync(join(tmpdir(), 'siyuan-skill-project-'));
    const previousHome = process.env['HOME'];
    const previousUserProfile = process.env['USERPROFILE'];
    const previousCwd = process.cwd();
    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
    process.chdir(project);
    try {
        run({ home, project, configDir: join(home, 'config') });
    } finally {
        process.chdir(previousCwd);
        if (previousHome === undefined) delete process.env['HOME'];
        else process.env['HOME'] = previousHome;
        if (previousUserProfile === undefined) delete process.env['USERPROFILE'];
        else process.env['USERPROFILE'] = previousUserProfile;
        rmSync(home, { recursive: true, force: true });
        rmSync(project, { recursive: true, force: true });
    }
}

function installedSkillDir(homeOrProject: string, target: string): string {
    return join(homeOrProject, target, 'skills', 'siyuan-cli');
}

test('installSkill dry-run reports per-target plans and writes nothing', () => {
    withSkillSandbox(({ home, configDir }) => {
        const preview = installSkill({ dryRun: true, configDir });
        assert.equal(preview.dryRun, true);
        assert.equal(preview.targets.length, 1); // nothing on record → default agent
        const plan = preview.targets[0]!;
        assert.equal(plan.agent, 'agents');
        assert.equal(plan.scope, 'global');
        assert.equal(plan.path, installedSkillDir(home, '.agents'));
        assert.equal(plan.action, 'installed');
        assert.deepEqual(plan.operations.map((op) => op.op), ['copy']);
        assert.ok(!existsSync(join(configDir, 'skill-installs.json')));
        assert.ok(!existsSync(plan.path));
    });
});

test('installSkill records global installs and a bare install syncs them all', () => {
    withSkillSandbox(({ home, configDir }) => {
        const first = installSkill({ agents: ['pi'], configDir });
        assert.equal(first.dryRun, false);
        assert.equal(
            first.targets[0]!.path,
            installedSkillDir(home, join('.pi', 'agent'))
        );
        assert.equal(readSkillInstalls(configDir).length, 1);

        // A second explicit install keeps the earlier record instead of replacing it.
        installSkill({ agents: ['claude-code'], configDir });
        assert.equal(readSkillInstalls(configDir).length, 2);

        // Bare install syncs every recorded location, not the default agent.
        const sync = installSkill({ configDir });
        assert.deepEqual(
            sync.targets.map((entry) => entry.agent),
            ['pi', 'claude-code']
        );
        assert.deepEqual(
            sync.targets.map((entry) => entry.action),
            ['updated', 'updated']
        );
        for (const entry of sync.targets) {
            assert.ok(existsSync(join(entry.path, 'SKILL.md')));
        }

        // Uninstall removes the directory and its record.
        uninstallSkill({ agents: ['claude-code'], configDir });
        assert.deepEqual(
            readSkillInstalls(configDir).map((record) => record.agent),
            ['pi']
        );
        uninstallSkill({ agents: ['pi'], configDir });
        assert.equal(readSkillInstalls(configDir).length, 0);
        assert.ok(!existsSync(installedSkillDir(home, join('.pi', 'agent'))));
    });
});

test('project-scope installs are not recorded', () => {
    withSkillSandbox(({ home, project, configDir }) => {
        const local = installSkill({ agents: ['pi'], scope: 'project', configDir });
        assert.equal(local.targets[0]!.path, installedSkillDir(project, '.pi'));
        assert.ok(!existsSync(join(configDir, 'skill-installs.json')));

        // A later bare install therefore still plans the default agent only.
        const bare = installSkill({ dryRun: true, configDir });
        assert.deepEqual(
            bare.targets.map((entry) => entry.path),
            [installedSkillDir(home, '.agents')]
        );
    });
});

function setInstalledSkillVersion(skillDir: string, version: string): void {
    const file = join(skillDir, 'SKILL.md');
    writeFileSync(
        file,
        readFileSync(file, 'utf-8').replace(/version: "[^"]*"/, `version: "${version}"`)
    );
}

test('checkInstalledSkillVersion probes every recorded install', () => {
    withSkillSandbox(({ home, configDir }) => {
        installSkill({ agents: ['pi'], configDir });
        installSkill({ agents: ['claude-code'], configDir });
        setInstalledSkillVersion(
            installedSkillDir(home, join('.pi', 'agent')),
            '9.9.9-test'
        );
        setInstalledSkillVersion(installedSkillDir(home, '.claude'), '0.1.0-old');

        const warning = checkInstalledSkillVersion('9.9.9-test', configDir);
        assert.match(warning ?? '', /installed 0\.1\.0-old/);
        assert.match(warning ?? '', /\.claude/);

        setInstalledSkillVersion(installedSkillDir(home, '.claude'), '9.9.9-test');
        assert.equal(checkInstalledSkillVersion('9.9.9-test', configDir), null);
    });
});

test('uninstall is idempotent and reports what it found', () => {
    withSkillSandbox(({ configDir }) => {
        const gone = uninstallSkill({ agents: ['pi'], configDir });
        assert.deepEqual(
            gone.targets.map((entry) => entry.action),
            ['absent']
        );

        installSkill({ agents: ['pi'], configDir });
        const removed = uninstallSkill({ agents: ['pi'], configDir });
        assert.deepEqual(
            removed.targets.map((entry) => entry.action),
            ['removed']
        );
    });
});

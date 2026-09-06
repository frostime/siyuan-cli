import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const configRoot = mkdtempSync(join(tmpdir(), 'siyuan-cli-entry-'));

function runCli(...args: string[]) {
    return spawnSync(
        process.execPath,
        ['--import', 'tsx', join(repoRoot, 'src', 'cli.ts'), ...args],
        {
            cwd: repoRoot,
            encoding: 'utf-8',
            env: { ...process.env, SIYUAN_CLI_CONFIG: configRoot }
        }
    );
}

test.after(() => {
    rmSync(configRoot, { recursive: true, force: true });
});

test('package publishes canonical and compatibility bin names through the same launcher', () => {
    const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'package.json'), 'utf-8')
    );
    assert.deepEqual(pkg.bin, {
        'siyuan-cli': './bin/siyuan.mjs',
        siyuan: './bin/siyuan.mjs'
    });
});

test('root help identifies the canonical command', () => {
    const result = runCli('--help');
    assert.equal(result.status, 0, result.stderr);
    assert.match(
        result.stdout,
        /siyuan-cli current\|workspace\|api\|tool\|skill\|approval\|extension/
    );
    assert.doesNotMatch(result.stdout, /\bsiyuan workspace\|api/);
});

test('history endpoint minimum kernel version appears in help and API list', () => {
    const endpointHelp = runCli(
        'api',
        'history.createDocHistory',
        '--help'
    );
    assert.equal(endpointHelp.status, 0, endpointHelp.stderr);
    assert.match(endpointHelp.stdout, /Requires SiYuan kernel >=3\.7\.0/);

    const groupedHelp = runCli('api', '-h');
    assert.equal(groupedHelp.status, 0, groupedHelp.stderr);
    assert.match(
        groupedHelp.stdout,
        /history\.createDocHistory.*requires kernel >=3\.7\.0/
    );

    const list = runCli('api', 'list');
    assert.equal(list.status, 0, list.stderr);
    const history = (
        JSON.parse(list.stdout) as Array<{
            id: string;
            minKernelVersion?: string;
        }>
    ).find((entry) => entry.id === 'history.createDocHistory');
    assert.equal(history?.minKernelVersion, '3.7.0');
});

test('custom API, tool, extension, endpoint, and tool help use the canonical command', () => {
    const cases = [
        {
            args: ['api', '-h'],
            expected: /siyuan-cli api \[OPTIONS\] <command>/
        },
        {
            args: ['tool', '-h'],
            expected: /siyuan-cli tool \[OPTIONS\] <command>/
        },
        {
            args: ['extension', '-h'],
            expected: /siyuan-cli extension <command>/
        },
        {
            args: ['api', 'query.sql', '--help'],
            expected: /siyuan-cli api query\.sql/
        },
        {
            args: ['tool', 'get-block-content', '--help'],
            expected: /siyuan-cli tool get-block-content/
        }
    ];

    for (const { args, expected } of cases) {
        const result = runCli(...args);
        assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
        assert.match(result.stdout, expected);
    }
});

test('skill install rejects bad agent ids, removed flags, and conflicting scopes', () => {
    const failures: [string[], RegExp][] = [
        [['skill', 'install', '--agent', 'bogus'], /SKILL_AGENT_UNKNOWN/],
        [['skill', 'install', '--target', 'claude'], /SKILL_FLAG_REMOVED/],
        [['skill', 'install', '--global', '--project'], /SKILL_SCOPE_CONFLICT/]
    ];

    for (const [args, expected] of failures) {
        const result = runCli(...args);
        const output = `${result.stdout}${result.stderr}`;
        assert.notEqual(result.status, 0, `${args.join(' ')}: ${output}`);
        assert.match(output, expected);
    }

    // Nothing was installed, so no install registry was created.
    assert.ok(!existsSync(join(configRoot, 'skill-installs.json')));
});

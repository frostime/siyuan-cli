import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
        /siyuan-cli workspace\|api\|tool\|doc\|skill\|approval\|extension/
    );
    assert.doesNotMatch(result.stdout, /\bsiyuan workspace\|api/);
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

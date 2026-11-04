/**
 * Process-level contract for `--print`:
 *
 * - `--print json` never yields text on stdout, and failures never yield
 *   anything on stdout;
 * - typo'd print modes fail instead of silently downgrading to compact;
 * - commands whose shape is fixed reject `--print` instead of ignoring it.
 *
 * All cases here are kernel-free: they fail at argument parsing or print-mode
 * validation, before any Kernel request.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const configRoot = mkdtempSync(join(tmpdir(), 'siyuan-cli-print-mode-'));

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

function stderrError(result: { stderr: string }): Record<string, unknown> {
    return JSON.parse(result.stderr.trim()) as Record<string, unknown>;
}

test.after(() => {
    rmSync(configRoot, { recursive: true, force: true });
});

test('failure keeps stdout empty and reports one JSON object on stderr', () => {
    const cases: [string[], string][] = [
        [['api', 'no.such.endpoint', '--print', 'json'], 'Unknown command'],
        [['no.such.command', '--print', 'json'], 'Unknown command'],
        [['api', 'query.sql', '--print', 'xml'], 'Unknown print mode'],
        [['api', 'query.sql', '--print', 'JSON'], 'Unknown print mode']
    ];

    for (const [args, expectedMessage] of cases) {
        const result = runCli(...args);
        const error = stderrError(result);
        assert.notEqual(result.status, 0, args.join(' '));
        assert.equal(result.stdout, '', `${args.join(' ')}: stdout must stay empty`);
        assert.match(String(error.message), new RegExp(expectedMessage));
        assert.ok(error.hint, `${args.join(' ')}: error must carry a hint`);
    }
});

test('print-mode errors are machine-readable', () => {
    const invalid = stderrError(runCli('api', 'query.sql', '--print', 'xml'));
    assert.equal(invalid.error, 'PRINT_MODE_INVALID');

    const unsupported = stderrError(runCli('skill', 'list', '--print', 'json'));
    assert.equal(unsupported.error, 'PRINT_MODE_UNSUPPORTED');
});

test('commands with fixed output reject --print instead of ignoring it', () => {
    const cases = [
        ['skill', 'list'],
        ['skill', 'targets'],
        ['extension', 'list'],
        ['extension', 'cache'],
        ['extension', 'init'],
        ['api', 'list', '--help']
    ];

    for (const args of cases) {
        const result = runCli(...args, '--print', 'json');
        assert.notEqual(result.status, 0, args.join(' '));
        assert.equal(result.stdout, '', `${args.join(' ')}: stdout must stay empty`);
        assert.equal(stderrError(result).error, 'PRINT_MODE_UNSUPPORTED');
    }
});

test('plain-JSON commands accept --print and keep their shape', () => {
    const result = runCli('api', 'list', '--print', 'json');
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as unknown;
    assert.ok(Array.isArray(parsed));
    assert.ok((parsed as unknown[]).length > 0);
});

test('same command without --print still writes its text output', () => {
    const result = runCli('skill', 'list');
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(result.stdout, '');
    assert.throws(() => JSON.parse(result.stdout), /Unexpected|JSON/);
});

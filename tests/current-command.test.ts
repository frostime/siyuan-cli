import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
// Absolute --import specifier so the CLI resolves tsx regardless of cwd.
const TSX_IMPORT = pathToFileURL(join(repoRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
// tsx resolves the '@/\*' path alias through the repo tsconfig; point it out
// explicitly because the CLI runs from arbitrary working directories.
const REPO_TSCONFIG = join(repoRoot, 'tsconfig.json');

// Each test gets an isolated config root and an empty working directory (the
// repo root has its own .siyuan-cli.yaml that would leak into resolution).
// Every runCli invocation is an independent CLI process, which is exactly
// what the two-step protocol needs.
let configRoot = '';
let workDir = '';

function runCli(args: string[], cwd: string = workDir) {
    return spawnSync(
        process.execPath,
        ['--import', TSX_IMPORT, join(repoRoot, 'src', 'cli.ts'), ...args],
        {
            cwd,
            encoding: 'utf-8',
            env: {
                ...process.env,
                SIYUAN_CLI_CONFIG: configRoot,
                TSX_TSCONFIG_PATH: REPO_TSCONFIG
            }
        }
    );
}

/** Async CLI run for tests that must keep the test-process event loop free. */
function runCliAsync(args: string[], cwd: string = workDir): Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
}> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            ['--import', TSX_IMPORT, join(repoRoot, 'src', 'cli.ts'), ...args],
            {
                cwd,
                env: {
                ...process.env,
                SIYUAN_CLI_CONFIG: configRoot,
                TSX_TSCONFIG_PATH: REPO_TSCONFIG
            }
            }
        );
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('error', reject);
        child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
}

function jsonOut(result: ReturnType<typeof runCli>): Record<string, any> {
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

function stderrError(result: ReturnType<typeof runCli>): Record<string, any> {
    assert.notEqual(result.status, 0, result.stdout);
    return JSON.parse(result.stderr);
}

function addWorkspace(name: string, url = 'http://127.0.0.1:9'): void {
    assert.equal(
        runCli(['workspace', 'add', name, '--url', url, '--skip-verify']).status,
        0
    );
}

function pendingFileNames(): string[] {
    try {
        return readdirSync(join(configRoot, 'process-binding', 'pending'));
    } catch {
        return [];
    }
}

test.beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), 'siyuan-current-'));
    workDir = mkdtempSync(join(tmpdir(), 'siyuan-current-work-'));
});

test.afterEach(() => {
    rmSync(configRoot, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
});

// ─── Two-step binding flow ───────────────────────────────────────────────────

test('bind → confirm → which → unbind works across independent CLI calls', () => {
    addWorkspace('dev');

    const bind = jsonOut(runCli(['current', 'bind', 'dev']));
    assert.equal(bind.status, 'pending');
    assert.equal(bind.workspace, 'dev');
    assert.match(bind.nonce, /^[0-9a-f]{32}$/);
    assert.equal(bind.confirm.command, `siyuan-cli current confirm ${bind.nonce}`);
    assert.match(bind.message, /new independent call/);

    const confirm = jsonOut(runCli(['current', 'confirm', bind.nonce]));
    assert.equal(confirm.status, 'bound');
    assert.equal(confirm.workspace, 'dev');
    assert.equal(confirm.anchor.strength, 'pid+start');
    assert.equal(typeof confirm.anchor.pid, 'number');
    assert.match(confirm.message, /without --workspace/);

    const which = jsonOut(runCli(['current', 'which']));
    assert.equal(which.status, 'resolved');
    assert.equal(which.workspace, 'dev');
    assert.equal(which.source, 'process-binding');
    assert.equal(which.binding.strength, 'pid+start');
    assert.equal(which.binding.pid, confirm.anchor.pid);

    const unbind = jsonOut(runCli(['current', 'unbind']));
    assert.equal(unbind.status, 'unbound');
    assert.equal(unbind.removed, 1);

    // No binding left: the scope falls back to the global default, which
    // `workspace add` auto-set to the first workspace.
    const whichAfter = jsonOut(runCli(['current', 'which']));
    assert.equal(whichAfter.status, 'resolved');
    assert.equal(whichAfter.source, 'global-current');
    assert.equal(whichAfter.workspace, 'dev');
    assert.equal(whichAfter.binding, null);
});

test('bind rejects unknown workspaces with a configuration error', () => {
    const result = runCli(['current', 'bind', 'missing']);
    assert.equal(result.status, 2);
    assert.equal(stderrError(result).error, 'WORKSPACE_NOT_FOUND');
});

test('confirm with an unknown nonce fails explicitly', () => {
    const result = runCli(['current', 'confirm', 'deadbeef']);
    assert.equal(result.status, 1);
    assert.equal(stderrError(result).error, 'PROCESS_BINDING_PENDING_NOT_FOUND');
});

test('bind fails on project-file disagreement without creating pending state', () => {
    addWorkspace('dev');
    addWorkspace('home');
    writeFileSync(
        join(workDir, '.siyuan-cli.yaml'),
        'schemaVersion: 1\nworkspace: home\n'
    );

    const conflict = runCli(['current', 'bind', 'dev']);
    assert.equal(conflict.status, 2, conflict.stderr);
    assert.equal(stderrError(conflict).error, 'CURRENT_SELECTION_CONFLICT');
    assert.deepEqual(pendingFileNames(), []);

    // Binding the name the project file selects is allowed.
    const agreeing = jsonOut(runCli(['current', 'bind', 'home']));
    assert.equal(agreeing.workspace, 'home');
    assert.equal(pendingFileNames().length, 1);
});

test('confirm rechecks the project file and fails if it changed after bind', () => {
    addWorkspace('dev');
    addWorkspace('home');

    const bind = jsonOut(runCli(['current', 'bind', 'dev']));
    assert.equal(pendingFileNames().length, 1);

    // A project file appears between bind and confirm and selects a
    // different workspace: confirm must exit with a configuration error.
    writeFileSync(
        join(workDir, '.siyuan-cli.yaml'),
        'schemaVersion: 1\nworkspace: home\n'
    );
    const confirm = runCli(['current', 'confirm', bind.nonce]);
    assert.equal(confirm.status, 2, confirm.stdout);
    assert.equal(stderrError(confirm).error, 'CURRENT_SELECTION_CONFLICT');
});

// ─── Deprecated workspace aliases ────────────────────────────────────────────

test('workspace use still works with a deprecation warning and sets the global default', () => {
    addWorkspace('dev');
    const use = runCli(['workspace', 'use', 'dev']);
    assert.equal(use.status, 0, use.stderr);
    assert.match(use.stderr, /DEPRECATED/);
    assert.match(use.stderr, /current global/);

    const which = jsonOut(runCli(['current', 'which']));
    assert.equal(which.source, 'global-current');
    assert.equal(which.workspace, 'dev');

    const legacyWhich = runCli(['workspace', 'which']);
    assert.equal(legacyWhich.status, 0, legacyWhich.stderr);
    assert.match(legacyWhich.stderr, /DEPRECATED/);
    assert.equal(jsonOut(legacyWhich).workspace, 'dev');
});

// ─── Verification split ──────────────────────────────────────────────────────

test('workspace verify without arguments explains the two verify surfaces', () => {
    const result = runCli(['workspace', 'verify']);
    assert.equal(result.status, 2);
    const error = stderrError(result);
    assert.equal(error.error, 'VERIFY_MODE_CONFLICT');
    assert.match(error.hint, /current verify/);
});

test('current verify rejects a workspace name', () => {
    addWorkspace('dev');
    const result = runCli(['current', 'verify', 'dev']);
    assert.equal(result.status, 2);
    assert.equal(stderrError(result).error, 'VERIFY_MODE_CONFLICT');
});

test('current verify resolves the selection chain and checks the kernel', async () => {
    const server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/api/system/version') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ code: 0, msg: '', data: { ver: '3.8.0' } }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    try {
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        addWorkspace('dev', `http://127.0.0.1:${address.port}`);

        // Async runs: the in-process kernel server must stay responsive
        // while the CLI child runs.
        const bind = JSON.parse((await runCliAsync(['current', 'bind', 'dev'])).stdout);
        const confirm = await runCliAsync(['current', 'confirm', bind.nonce]);
        assert.equal(confirm.status, 0, confirm.stderr);

        const verify = JSON.parse((await runCliAsync(['current', 'verify'])).stdout);
        assert.equal(verify.ok, true);
        assert.equal(verify.workspace, 'dev');
        assert.equal(verify.source, 'process-binding');
        assert.equal(verify.version, '3.8.0');
        assert.equal(verify.binding?.strength, 'pid+start');
    } finally {
        server.close();
    }
});

// ─── Help surface ────────────────────────────────────────────────────────────

test('root help lists current; workspace help marks deprecated aliases', () => {
    const rootHelp = runCli(['--help']);
    assert.equal(rootHelp.status, 0, rootHelp.stderr);
    assert.match(rootHelp.stdout, /\bcurrent\b/);

    const workspaceHelp = runCli(['workspace', '--help']);
    assert.equal(workspaceHelp.status, 0, workspaceHelp.stderr);
    assert.match(workspaceHelp.stdout, /Deprecated/);
    assert.match(workspaceHelp.stdout, /current which/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { join as joinPath } from 'pathe';

import { resolveEffectiveWorkspace } from '../src/workspace/resolve.ts';
import { loadConfig } from '../src/workspace/config.ts';
import {
    confirmPendingProbe,
    createPendingProbe
} from '../src/workspace/process-binding.ts';
import { CliError } from '../src/shared/errors.ts';
import type { ProcessTreeHost } from '../src/workspace/process-tree.ts';
import type { AppConfig } from '../src/workspace/config.ts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Build a /proc/<pid>/stat body: state(0) ppid(1) ... starttime(19). */
function linuxStat(pid: number, comm: string, ppid: number, starttime: number): string {
    const fields = ['S', String(ppid), ...Array<string>(17).fill('0'), String(starttime)];
    return `${pid} (${comm}) ${fields.join(' ')}`;
}

/**
 * An "agent scope": every CLI call runs as a child of the agent process 200.
 * `selfPid` varies per call; the agent's start identity is stable.
 */
function scopeHost(selfPid: number): ProcessTreeHost {
    const files: Record<string, string> = {};
    files['/proc/1/stat'] = linuxStat(1, 'init', 0, 1);
    files['/proc/200/stat'] = linuxStat(200, 'agent', 1, 2000);
    files[`/proc/${selfPid}/stat`] = linuxStat(selfPid, 'cli', 200, 3000 + selfPid);
    return {
        platform: 'linux',
        pid: selfPid,
        run: () => undefined,
        readTextFile: (path) => files[path],
        readSymlink: () => undefined
    };
}

const CONFIG_YAML = `
schemaVersion: 1
current: home
workspaces:
  dev:
    baseUrl: http://127.0.0.1:6806
  home:
    baseUrl: http://127.0.0.1:6807
`;

// Per-test isolated roots; node:test runs tests in a file sequentially.
let configRoot: string;
let projectRoot: string;
let previousConfigRoot: string | undefined;

test.before(() => {
    previousConfigRoot = process.env['SIYUAN_CLI_CONFIG'];
});

test.after(() => {
    if (previousConfigRoot === undefined) delete process.env['SIYUAN_CLI_CONFIG'];
    else process.env['SIYUAN_CLI_CONFIG'] = previousConfigRoot;
});

test.beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), 'siyuan-selection-'));
    projectRoot = mkdtempSync(join(tmpdir(), 'siyuan-selection-project-'));
    process.env['SIYUAN_CLI_CONFIG'] = configRoot;
    writeFileSync(join(configRoot, 'config.yaml'), CONFIG_YAML);
});

test.afterEach(() => {
    rmSync(configRoot, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
});

/** Bind `workspace` to the agent scope using the fake two-step protocol. */
function bindWorkspace(workspace: string): void {
    const probe = createPendingProbe(workspace, scopeHost(101));
    confirmPendingProbe(probe.nonce, scopeHost(102));
}

function writeProjectFile(workspace?: string): string {
    if (workspace !== undefined) {
        writeFileSync(
            join(projectRoot, '.siyuan-cli.yaml'),
            `schemaVersion: 1\nworkspace: ${workspace}\n`
        );
    }
    return projectRoot;
}

function loadTestConfig(): AppConfig {
    return loadConfig();
}

// ─── Selection chain ─────────────────────────────────────────────────────────

test('process binding selects the workspace when nothing else does', () => {
    bindWorkspace('dev');
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        projectRoot,
        { processTreeHost: scopeHost(103) }
    );
    assert.equal(resolved.name, 'dev');
    assert.equal(resolved.source, 'process-binding');
    assert.equal(resolved.binding?.anchor.pid, 200);
    assert.equal(resolved.binding?.strength, 'pid+start');
});

test('a scope outside the anchor does not see the binding', () => {
    bindWorkspace('dev');
    const unrelated = scopeHost(103);
    // Replace the fake ancestry with one that does not contain the agent.
    const files: Record<string, string> = {
        '/proc/1/stat': linuxStat(1, 'init', 0, 1),
        '/proc/400/stat': linuxStat(400, 'other-agent', 1, 500),
        '/proc/103/stat': linuxStat(103, 'cli', 400, 600)
    };
    const outside: ProcessTreeHost = {
        ...unrelated,
        readTextFile: (path) => files[path]
    };
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        projectRoot,
        { processTreeHost: outside }
    );
    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'global-current');
    assert.equal(resolved.binding, undefined);
});

test('project file alone keeps project-file provenance', () => {
    const cwd = writeProjectFile('home');
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        cwd,
        { processTreeHost: scopeHost(103) }
    );
    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'project-file');
    assert.equal(resolved.binding, undefined);
});

test('agreeing project file and binding resolve with binding provenance', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('dev');
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        cwd,
        { processTreeHost: scopeHost(103) }
    );
    assert.equal(resolved.name, 'dev');
    assert.equal(resolved.source, 'process-binding');
    assert.equal(resolved.binding?.anchor.pid, 200);
    assert.equal(resolved.projectConfigPath, joinPath(projectRoot, '.siyuan-cli.yaml'));
});

test('disagreeing project file and binding fail with a configuration error', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('home');
    assert.throws(
        () =>
            resolveEffectiveWorkspace(loadTestConfig(), {}, cwd, {
                processTreeHost: scopeHost(103)
            }),
        (error: unknown) => {
            if (!(error instanceof CliError)) return false;
            assert.equal(error.errorType, 'CURRENT_SELECTION_CONFLICT');
            assert.equal(error.code, 2);
            const details = error.details as {
                projectWorkspace?: string;
                boundWorkspace?: string;
            };
            assert.equal(details.projectWorkspace, 'home');
            assert.equal(details.boundWorkspace, 'dev');
            return true;
        }
    );
});

test('a workspace flag outranks binding and project file without conflict', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('home');
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        { workspace: 'home' },
        cwd,
        { processTreeHost: scopeHost(103) }
    );
    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'flag');
    assert.equal(resolved.binding, undefined);
});

test('the environment variable outranks binding and project file without conflict', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('home');
    process.env['SIYUAN_CLI_WORKSPACE'] = 'home';
    try {
        const resolved = resolveEffectiveWorkspace(
            loadTestConfig(),
            {},
            cwd,
            { processTreeHost: scopeHost(103) }
        );
        assert.equal(resolved.name, 'home');
        assert.equal(resolved.source, 'env');
    } finally {
        delete process.env['SIYUAN_CLI_WORKSPACE'];
    }
});

test('a bound workspace missing from the catalog fails as WORKSPACE_NOT_FOUND', () => {
    bindWorkspace('ghost');
    assert.throws(
        () =>
            resolveEffectiveWorkspace(loadTestConfig(), {}, projectRoot, {
                processTreeHost: scopeHost(103)
            }),
        (error: unknown) =>
            error instanceof CliError && error.errorType === 'WORKSPACE_NOT_FOUND'
    );
});

test('ad-hoc baseUrl bypasses binding and project file', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('home');
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        { baseUrl: 'http://127.0.0.1:9999' },
        cwd,
        { processTreeHost: scopeHost(103) }
    );
    assert.equal(resolved.name, '<ad-hoc>');
    assert.equal(resolved.source, 'ad-hoc');
    assert.equal(resolved.binding, undefined);
});

test('without binding or project file the selection falls back to global current', () => {
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        projectRoot,
        { processTreeHost: scopeHost(103) }
    );
    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'global-current');
    assert.equal(resolved.binding, undefined);
});

test('project permission overlays survive a binding-selected workspace', () => {
    bindWorkspace('dev');
    writeFileSync(
        join(projectRoot, '.siyuan-cli.yaml'),
        'schemaVersion: 1\nworkspace: dev\npermission:\n  default: deny\n'
    );
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        projectRoot,
        { processTreeHost: scopeHost(103) }
    );
    assert.equal(resolved.name, 'dev');
    assert.equal(resolved.source, 'process-binding');
    assert.equal(resolved.effectivePermission?.default, 'deny');
});

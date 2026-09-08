import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { join as joinPath } from 'pathe';

import { resolveEffectiveWorkspace } from '../src/workspace/resolve.ts';
import { loadConfig } from '../src/workspace/config.ts';
import {
    confirmPendingProbe,
    createPendingProbe
} from '../src/workspace/binding/protocol.ts';
import type {
    ProcessObserver,
    ProcessScopeObservation
} from '../src/workspace/binding/observation.ts';
import {
    inspectProcessInstance,
    type AncestryTermination,
    type ProcessAncestry,
    type ProcessNode
} from '../src/workspace/binding/process-tree.ts';
import { CliError } from '../src/shared/errors.ts';
import type { AppConfig } from '../src/workspace/config.ts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function processNode(pid: number, ppid: number, startId: number): ProcessNode {
    return {
        pid,
        ppid,
        name: pid === 1 ? 'init' : pid === 200 ? 'agent' : 'cli',
        startId: String(startId)
    };
}

/** One short-lived CLI below a stable long-lived caller and the machine root. */
function scope(
    selfPid: number,
    anchorPid = 200,
    termination: AncestryTermination = { kind: 'root' }
): ProcessAncestry {
    return {
        platform: 'linux',
        chain: [
            processNode(selfPid, anchorPid, 3000 + selfPid),
            processNode(anchorPid, 1, 2000 + anchorPid),
            processNode(1, 0, 1)
        ],
        termination
    };
}

function observerFor(
    ancestry: ProcessAncestry,
    visibleProcesses: readonly ProcessNode[] = ancestry.chain,
    calls?: { capture: number; inspect: number }
): ProcessObserver {
    const byPid = new Map(visibleProcesses.map((node) => [node.pid, node]));
    return {
        captureBindingAncestry() {
            if (calls) calls.capture += 1;
            return ancestry;
        },
        inspectAnchorsAndCurrentScope(anchors): ProcessScopeObservation {
            if (calls) calls.inspect += 1;
            const anchorInspections = anchors.map((anchor) =>
                inspectProcessInstance(anchor, byPid.get(anchor.pid), true)
            );
            return {
                platform: ancestry.platform,
                anchorInspections,
                ...(anchorInspections.some(({ state }) => state !== 'stale')
                    ? { ancestry }
                    : {})
            };
        }
    };
}

function scopeObserver(
    selfPid: number,
    anchorPid = 200,
    calls?: { capture: number; inspect: number }
): ProcessObserver {
    return observerFor(scope(selfPid, anchorPid), undefined, calls);
}

function bindingFileNames(): string[] {
    try {
        return readdirSync(join(configRoot, 'process-binding', 'bindings'));
    } catch {
        return [];
    }
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
    const probe = createPendingProbe(workspace, scopeObserver(101));
    confirmPendingProbe(probe.nonce, scopeObserver(102));
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
        { processObserver: scopeObserver(103) }
    );
    assert.equal(resolved.name, 'dev');
    assert.equal(resolved.source, 'process-binding');
    assert.equal(resolved.binding?.anchor.pid, 200);
    assert.equal(resolved.binding?.strength, 'pid+start');
});

test('a complete unrelated scope falls through without seeing the live binding', () => {
    bindWorkspace('dev');
    const unrelated = scope(103, 400);
    const liveBindingAnchor = processNode(200, 1, 2200);
    const outside = observerFor(unrelated, [
        ...unrelated.chain,
        liveBindingAnchor
    ]);

    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        projectRoot,
        { processObserver: outside }
    );

    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'global-current');
    assert.equal(resolved.binding, undefined);
});

test('a truncated unrelated scope fails loudly while its live binding remains', () => {
    bindWorkspace('dev');
    const truncated = scope(103, 400, {
        kind: 'parent-missing',
        parentPid: 999
    });
    const liveBindingAnchor = processNode(200, 1, 2200);

    assert.throws(
        () =>
            resolveEffectiveWorkspace(loadTestConfig(), {}, projectRoot, {
                processObserver: observerFor(truncated, [
                    ...truncated.chain,
                    liveBindingAnchor
                ])
            }),
        (error: unknown) => {
            if (!(error instanceof CliError)) return false;
            assert.equal(
                error.errorType,
                'PROCESS_BINDING_OBSERVATION_INSUFFICIENT'
            );
            assert.equal(
                (error.details as { requestSent?: boolean }).requestSent,
                false
            );
            return true;
        }
    );
    assert.equal(bindingFileNames().length, 1);
});

test('a conclusively reused anchor is reclaimed before global fallback', () => {
    bindWorkspace('dev');
    const calls = { capture: 0, inspect: 0 };
    const current = scope(103, 400);
    const reusedAnchor = processNode(200, 1, 9999);

    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        projectRoot,
        {
            processObserver: observerFor(
                current,
                [...current.chain, reusedAnchor],
                calls
            )
        }
    );

    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'global-current');
    assert.deepEqual(calls, { capture: 0, inspect: 1 });
    assert.deepEqual(bindingFileNames(), []);
});

test('project selection cannot bypass uncertainty from a retained binding', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('home');
    const truncated = scope(103, 400, {
        kind: 'parent-missing',
        parentPid: 999
    });
    const liveBindingAnchor = processNode(200, 1, 2200);

    assert.throws(
        () =>
            resolveEffectiveWorkspace(loadTestConfig(), {}, cwd, {
                processObserver: observerFor(truncated, [
                    ...truncated.chain,
                    liveBindingAnchor
                ])
            }),
        (error: unknown) =>
            error instanceof CliError &&
            error.errorType === 'PROCESS_BINDING_OBSERVATION_INSUFFICIENT'
    );
});

test('project file alone keeps project-file provenance without process observation', () => {
    const cwd = writeProjectFile('home');
    const calls = { capture: 0, inspect: 0 };
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        cwd,
        { processObserver: scopeObserver(103, 200, calls) }
    );
    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'project-file');
    assert.equal(resolved.binding, undefined);
    assert.deepEqual(calls, { capture: 0, inspect: 0 });
});

test('agreeing project file and binding resolve with binding provenance', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('dev');
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        cwd,
        { processObserver: scopeObserver(103) }
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
                processObserver: scopeObserver(103)
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

test('a workspace flag bypasses binding observation and project conflict', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('home');
    const calls = { capture: 0, inspect: 0 };
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        { workspace: 'home' },
        cwd,
        { processObserver: scopeObserver(103, 200, calls) }
    );
    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'flag');
    assert.equal(resolved.binding, undefined);
    assert.deepEqual(calls, { capture: 0, inspect: 0 });
});

test('the environment variable bypasses binding observation and project conflict', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('home');
    const calls = { capture: 0, inspect: 0 };
    process.env['SIYUAN_CLI_WORKSPACE'] = 'home';
    try {
        const resolved = resolveEffectiveWorkspace(
            loadTestConfig(),
            {},
            cwd,
            { processObserver: scopeObserver(103, 200, calls) }
        );
        assert.equal(resolved.name, 'home');
        assert.equal(resolved.source, 'env');
        assert.deepEqual(calls, { capture: 0, inspect: 0 });
    } finally {
        delete process.env['SIYUAN_CLI_WORKSPACE'];
    }
});

test('a bound workspace missing from the catalog fails as WORKSPACE_NOT_FOUND', () => {
    bindWorkspace('ghost');
    assert.throws(
        () =>
            resolveEffectiveWorkspace(loadTestConfig(), {}, projectRoot, {
                processObserver: scopeObserver(103)
            }),
        (error: unknown) =>
            error instanceof CliError && error.errorType === 'WORKSPACE_NOT_FOUND'
    );
});

test('ad-hoc baseUrl bypasses binding observation and project discovery', () => {
    bindWorkspace('dev');
    const cwd = writeProjectFile('home');
    const calls = { capture: 0, inspect: 0 };
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        { baseUrl: 'http://127.0.0.1:9999' },
        cwd,
        { processObserver: scopeObserver(103, 200, calls) }
    );
    assert.equal(resolved.name, '<ad-hoc>');
    assert.equal(resolved.source, 'ad-hoc');
    assert.equal(resolved.binding, undefined);
    assert.deepEqual(calls, { capture: 0, inspect: 0 });
});

test('without binding or project file the global fallback skips process observation', () => {
    const calls = { capture: 0, inspect: 0 };
    const resolved = resolveEffectiveWorkspace(
        loadTestConfig(),
        {},
        projectRoot,
        { processObserver: scopeObserver(103, 200, calls) }
    );
    assert.equal(resolved.name, 'home');
    assert.equal(resolved.source, 'global-current');
    assert.equal(resolved.binding, undefined);
    assert.deepEqual(calls, { capture: 0, inspect: 0 });
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
        { processObserver: scopeObserver(103) }
    );
    assert.equal(resolved.name, 'dev');
    assert.equal(resolved.source, 'process-binding');
    assert.equal(resolved.effectivePermission?.default, 'deny');
});

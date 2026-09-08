import test from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    cancelPendingProbe,
    confirmPendingProbe,
    createPendingProbe,
    findActiveBinding,
    getPendingProbe,
    unbindProcessScope,
    type ProcessBinding
} from '../src/workspace/binding/protocol.ts';
import type {
    ProcessObserver,
    ProcessScopeObservation
} from '../src/workspace/binding/observation.ts';
import type {
    AncestryTermination,
    ProcessAncestry,
    ProcessInstanceState,
    ProcessNode
} from '../src/workspace/binding/process-tree.ts';
import { CliError } from '../src/shared/errors.ts';

function node(
    pid: number,
    ppid: number,
    startId = `start-${pid}`
): ProcessNode {
    return { pid, ppid, startId };
}

function ancestry(
    chain: ProcessNode[],
    termination: AncestryTermination = { kind: 'root' }
): ProcessAncestry {
    return { platform: 'linux', chain, termination };
}

function scope(selfPid: number, anchorPid = 200): ProcessAncestry {
    return ancestry([node(selfPid, anchorPid), node(anchorPid, 1), node(1, 0)]);
}

function captureObserver(observation: ProcessAncestry): ProcessObserver {
    return {
        captureBindingAncestry: () => observation,
        inspectAnchorsAndCurrentScope: () => {
            throw new Error('scope inspection was not expected');
        }
    };
}

function scopeObserver(options: {
    states: Record<number, ProcessInstanceState>;
    ancestry?: ProcessAncestry;
    calls?: { inspect: number };
}): ProcessObserver {
    return {
        captureBindingAncestry: () => {
            throw new Error('binding capture was not expected');
        },
        inspectAnchorsAndCurrentScope(anchors): ProcessScopeObservation {
            if (options.calls) options.calls.inspect += 1;
            return {
                platform: 'linux',
                anchorInspections: anchors.map((anchor) => {
                    const state = options.states[anchor.pid] ?? 'unknown';
                    return {
                        anchor,
                        state,
                        reason:
                            state === 'live'
                                ? 'identity-match'
                                : state === 'stale'
                                  ? 'pid-not-found'
                                  : 'identity-incomplete'
                    };
                }),
                ...(options.ancestry ? { ancestry: options.ancestry } : {})
            };
        }
    };
}

function pendingDir(): string {
    return join(configRoot, 'process-binding', 'pending');
}

function bindingsDir(): string {
    return join(configRoot, 'process-binding', 'bindings');
}

function fileNames(directory: string): string[] {
    try {
        return readdirSync(directory).sort();
    } catch {
        return [];
    }
}

function writeBinding(
    fileName: string,
    workspace: string,
    anchor: ProcessNode
): void {
    mkdirSync(bindingsDir(), { recursive: true });
    const binding: ProcessBinding = {
        workspace,
        anchor,
        boundAt: '2026-09-08T00:00:00.000Z'
    };
    writeFileSync(join(bindingsDir(), fileName), JSON.stringify(binding));
}

function protocolError(fn: () => unknown, errorType: string): CliError {
    let caught: unknown;
    try {
        fn();
    } catch (error) {
        caught = error;
    }
    assert.ok(caught instanceof CliError);
    assert.equal(caught.errorType, errorType);
    return caught;
}

let configRoot = '';
let previousConfigRoot: string | undefined;

test.before(() => {
    previousConfigRoot = process.env['SIYUAN_CLI_CONFIG'];
});

test.after(() => {
    if (previousConfigRoot === undefined)
        delete process.env['SIYUAN_CLI_CONFIG'];
    else process.env['SIYUAN_CLI_CONFIG'] = previousConfigRoot;
});

test.beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), 'siyuan-procbinding-'));
    process.env['SIYUAN_CLI_CONFIG'] = configRoot;
});

test.afterEach(() => {
    rmSync(configRoot, { recursive: true, force: true });
});

test('bind and confirm persist a reliable common anchor and consume the nonce', () => {
    const bindTime = Date.parse('2026-09-08T10:00:00.000Z');
    const probe = createPendingProbe(
        'dev',
        captureObserver(scope(101)),
        () => bindTime,
        '/work/project'
    );
    const storedPending = JSON.parse(
        readFileSync(join(pendingDir(), `${probe.nonce}.json`), 'utf8')
    );
    assert.deepEqual(storedPending.termination, { kind: 'root' });

    const result = confirmPendingProbe(
        probe.nonce,
        captureObserver(scope(102)),
        () => bindTime + 1_000
    );
    assert.equal(result.binding.workspace, 'dev');
    assert.equal(result.binding.anchor.pid, 200);
    assert.equal(result.binding.cwd, '/work/project');
    assert.deepEqual(fileNames(pendingDir()), []);
    assert.equal(fileNames(bindingsDir()).length, 1);
});

test('identity-less observations with the same self PID are rejected as the same call', () => {
    const identitylessSelf = { pid: 101, ppid: 200 };
    const probe = createPendingProbe(
        'dev',
        captureObserver(ancestry([identitylessSelf, node(200, 1), node(1, 0)]))
    );

    const failure = protocolError(
        () =>
            confirmPendingProbe(
                probe.nonce,
                captureObserver(
                    ancestry([identitylessSelf, node(200, 1), node(1, 0)])
                )
            ),
        'PROCESS_BINDING_SAME_CALL'
    );
    assert.equal(
        (failure.details as { pendingRetained: boolean }).pendingRetained,
        true
    );
    assert.equal(getPendingProbe(probe.nonce).nonce, probe.nonce);
});

test('a failed confirm retains the same nonce and original expiry for retry', () => {
    const bindTime = Date.parse('2026-09-08T10:00:00.000Z');
    const incomplete = { kind: 'parent-missing', parentPid: 999 } as const;
    const probe = createPendingProbe(
        'dev',
        captureObserver(ancestry([node(101, 200), node(200, 999)], incomplete)),
        () => bindTime
    );
    const before = readFileSync(
        join(pendingDir(), `${probe.nonce}.json`),
        'utf8'
    );

    const failure = protocolError(
        () =>
            confirmPendingProbe(
                probe.nonce,
                captureObserver(
                    ancestry([node(102, 300), node(300, 998)], {
                        kind: 'parent-missing',
                        parentPid: 998
                    })
                ),
                () => bindTime + 60_000
            ),
        'PROCESS_BINDING_OBSERVATION_INSUFFICIENT'
    );
    assert.deepEqual(failure.details, {
        bindingExists: false,
        pendingRetained: true,
        canRetry: true,
        retryCommand: `siyuan-cli current confirm ${probe.nonce}`,
        cancelCommand: `siyuan-cli current cancel ${probe.nonce}`,
        requestSent: false,
        bindTermination: incomplete,
        confirmTermination: { kind: 'parent-missing', parentPid: 998 }
    });
    assert.equal(
        readFileSync(join(pendingDir(), `${probe.nonce}.json`), 'utf8'),
        before
    );

    const retried = confirmPendingProbe(
        probe.nonce,
        captureObserver(ancestry([node(103, 200), node(200, 999)], incomplete)),
        () => bindTime + 2 * 60_000
    );
    assert.equal(retried.binding.anchor.pid, 200);
    assert.deepEqual(fileNames(pendingDir()), []);
});

test('legacy pending records can confirm on a common anchor but no-match is insufficient', () => {
    const probe = createPendingProbe('dev', captureObserver(scope(101)));
    const path = join(pendingDir(), `${probe.nonce}.json`);
    const legacy = JSON.parse(readFileSync(path, 'utf8'));
    delete legacy.termination;
    writeFileSync(path, JSON.stringify(legacy));

    const failure = protocolError(
        () =>
            confirmPendingProbe(probe.nonce, captureObserver(scope(102, 300))),
        'PROCESS_BINDING_OBSERVATION_INSUFFICIENT'
    );
    assert.equal(
        (failure.details as { pendingRetained: boolean }).pendingRetained,
        true
    );

    const confirmed = confirmPendingProbe(
        probe.nonce,
        captureObserver(scope(103))
    );
    assert.equal(confirmed.binding.anchor.pid, 200);
});

test('cancel deletes only its nonce and performs no process observation', () => {
    const first = createPendingProbe('dev', captureObserver(scope(101)));
    const second = createPendingProbe('home', captureObserver(scope(102)));
    writeBinding('confirmed.json', 'dev', node(200, 1));

    const cancelled = cancelPendingProbe(first.nonce);
    assert.equal(cancelled.workspace, 'dev');
    assert.deepEqual(fileNames(pendingDir()), [`${second.nonce}.json`]);
    assert.deepEqual(fileNames(bindingsDir()), ['confirmed.json']);
    protocolError(
        () => getPendingProbe(first.nonce),
        'PROCESS_BINDING_PENDING_NOT_FOUND'
    );
});

test('unbind removes confirmed scope bindings without consuming pending probes', () => {
    writeBinding('confirmed.json', 'dev', node(200, 1));
    const pending = createPendingProbe('home', captureObserver(scope(101)));

    const result = unbindProcessScope(
        scopeObserver({ states: { 200: 'live' }, ancestry: scope(102) })
    );
    assert.deepEqual(result, { removed: 1, reclaimed: 0 });
    assert.equal(getPendingProbe(pending.nonce).workspace, 'home');
    assert.deepEqual(fileNames(bindingsDir()), []);
});

test('confirming a new binding replaces an existing binding in the same scope', () => {
    writeBinding('old.json', 'dev', node(200, 1));
    const probe = createPendingProbe('home', captureObserver(scope(101)));

    const result = confirmPendingProbe(
        probe.nonce,
        captureObserver(
            ancestry([node(102, 250), node(250, 200), node(200, 1), node(1, 0)])
        )
    );
    assert.equal(result.binding.workspace, 'home');
    assert.equal(result.binding.anchor.pid, 200);
    assert.equal(fileNames(bindingsDir()).length, 1);
    const stored = JSON.parse(
        readFileSync(join(bindingsDir(), fileNames(bindingsDir())[0]!), 'utf8')
    );
    assert.equal(stored.workspace, 'home');
});

test('active lookup skips observation when no valid binding record remains', () => {
    mkdirSync(bindingsDir(), { recursive: true });
    writeFileSync(join(bindingsDir(), 'malformed.json'), '{bad json');
    const calls = { inspect: 0 };

    const active = findActiveBinding(scopeObserver({ states: {}, calls }));
    assert.equal(active, undefined);
    assert.equal(calls.inspect, 0);
    assert.deepEqual(fileNames(bindingsDir()), []);
});

test('active lookup reclaims conclusively stale records without caller ancestry', () => {
    writeBinding('missing.json', 'dev', node(200, 1));
    writeBinding('reused.json', 'home', node(300, 1));
    const calls = { inspect: 0 };

    const active = findActiveBinding(
        scopeObserver({ states: { 200: 'stale', 300: 'stale' }, calls })
    );
    assert.equal(active, undefined);
    assert.equal(calls.inspect, 1);
    assert.deepEqual(fileNames(bindingsDir()), []);
});

test('active lookup chooses the nearest matching retained anchor', () => {
    writeBinding('outer.json', 'outer', node(200, 1));
    writeBinding('inner.json', 'inner', node(300, 200));
    const current = ancestry([
        node(103, 300),
        node(300, 200),
        node(200, 1),
        node(1, 0)
    ]);

    const active = findActiveBinding(
        scopeObserver({
            states: { 200: 'live', 300: 'live' },
            ancestry: current
        })
    );
    assert.equal(active?.binding.workspace, 'inner');
    assert.equal(active?.match.node.pid, 300);
});

test('complete ancestry gives conclusive absence for an unrelated retained binding', () => {
    writeBinding('other.json', 'dev', node(400, 1));
    const active = findActiveBinding(
        scopeObserver({ states: { 400: 'unknown' }, ancestry: scope(103) })
    );
    assert.equal(active, undefined);
    assert.deepEqual(fileNames(bindingsDir()), ['other.json']);
});

test('incomplete ancestry with a retained binding fails loudly and keeps the record', () => {
    writeBinding('uncertain.json', 'dev', node(400, 1));
    const incomplete = ancestry([node(103, 300), node(300, 999)], {
        kind: 'parent-missing',
        parentPid: 999
    });

    const failure = protocolError(
        () =>
            findActiveBinding(
                scopeObserver({
                    states: { 400: 'unknown' },
                    ancestry: incomplete
                })
            ),
        'PROCESS_BINDING_OBSERVATION_INSUFFICIENT'
    );
    assert.deepEqual(failure.details, {
        bindingExists: true,
        bindingCount: 1,
        requestSent: false,
        termination: incomplete.termination
    });
    assert.deepEqual(fileNames(bindingsDir()), ['uncertain.json']);
});

test('a same-PID identity gap remains unknown even with complete ancestry', () => {
    writeBinding('signature.json', 'dev', {
        pid: 200,
        ppid: 1,
        commandSignature: 'sha256:recorded'
    });
    const current = ancestry([
        node(103, 200),
        { pid: 200, ppid: 1, commandSignature: 'sha256:observed' },
        node(1, 0)
    ]);

    protocolError(
        () =>
            findActiveBinding(
                scopeObserver({
                    states: { 200: 'unknown' },
                    ancestry: current
                })
            ),
        'PROCESS_BINDING_OBSERVATION_INSUFFICIENT'
    );
    assert.deepEqual(fileNames(bindingsDir()), ['signature.json']);
});

test('malformed nonce input cannot alias or remove pending state', () => {
    const probe = createPendingProbe('dev', captureObserver(scope(101)));
    protocolError(
        () => getPendingProbe(`${probe.nonce}/../other`),
        'PROCESS_BINDING_NONCE_INVALID'
    );
    assert.equal(getPendingProbe(probe.nonce).nonce, probe.nonce);
});

test('unreadable state is retained and fails pending and binding operations loudly', () => {
    const unreadableNonce = 'b'.repeat(32);
    const unreadablePending = join(pendingDir(), `${unreadableNonce}.json`);
    mkdirSync(unreadablePending, { recursive: true });

    const pendingFailure = protocolError(
        () => cancelPendingProbe(unreadableNonce),
        'PROCESS_BINDING_STATE_UNAVAILABLE'
    );
    assert.equal(
        (pendingFailure.details as { pendingRetained: boolean })
            .pendingRetained,
        true
    );
    assert.equal(existsSync(unreadablePending), true);

    const unreadableBinding = join(bindingsDir(), 'unreadable.json');
    mkdirSync(unreadableBinding, { recursive: true });
    const calls = { inspect: 0 };
    protocolError(
        () => findActiveBinding(scopeObserver({ states: {}, calls })),
        'PROCESS_BINDING_STATE_UNAVAILABLE'
    );
    assert.equal(calls.inspect, 0);
    assert.equal(existsSync(unreadableBinding), true);
});

test('an unrelated unreadable pending record does not block a new bind', () => {
    const unreadableNonce = 'd'.repeat(32);
    const unreadablePending = join(pendingDir(), `${unreadableNonce}.json`);
    mkdirSync(unreadablePending, { recursive: true });

    const created = createPendingProbe('dev', captureObserver(scope(101)));

    assert.equal(getPendingProbe(created.nonce).workspace, 'dev');
    assert.equal(existsSync(unreadablePending), true);
});

test('confirm write failure retains the pending nonce with retry recovery', () => {
    const probe = createPendingProbe('dev', captureObserver(scope(101)));
    mkdirSync(join(configRoot, 'process-binding'), { recursive: true });
    writeFileSync(bindingsDir(), 'not a directory');

    const failure = protocolError(
        () => confirmPendingProbe(probe.nonce, captureObserver(scope(102))),
        'PROCESS_BINDING_PERSISTENCE_FAILED'
    );
    const details = failure.details as Record<string, unknown>;
    assert.equal(details['bindingExists'], false);
    assert.equal(details['pendingRetained'], true);
    assert.equal(
        details['retryCommand'],
        `siyuan-cli current confirm ${probe.nonce}`
    );
    assert.equal(
        details['cancelCommand'],
        `siyuan-cli current cancel ${probe.nonce}`
    );
    assert.equal(getPendingProbe(probe.nonce).nonce, probe.nonce);
});

test('confirm cleanup failure reports that the binding was already written', () => {
    const probe = createPendingProbe('dev', captureObserver(scope(101)));
    const pendingPath = join(pendingDir(), `${probe.nonce}.json`);
    const observer: ProcessObserver = {
        captureBindingAncestry() {
            rmSync(pendingPath);
            mkdirSync(pendingPath);
            return scope(102);
        },
        inspectAnchorsAndCurrentScope() {
            throw new Error('scope inspection was not expected');
        }
    };

    const failure = protocolError(
        () => confirmPendingProbe(probe.nonce, observer),
        'PROCESS_BINDING_PERSISTENCE_FAILED'
    );
    const details = failure.details as Record<string, unknown>;
    assert.equal(details['bindingExists'], true);
    assert.equal(details['pendingRetained'], true);
    assert.equal(details['canRetry'], false);
    assert.equal(
        details['cancelCommand'],
        `siyuan-cli current cancel ${probe.nonce}`
    );
    assert.equal(fileNames(bindingsDir()).length, 1);
    assert.equal(existsSync(pendingPath), true);
});

test('expired and damaged pending records are removed and cannot retry', () => {
    const createdAt = Date.parse('2026-09-08T10:00:00.000Z');
    const probe = createPendingProbe(
        'dev',
        captureObserver(scope(101)),
        () => createdAt
    );
    const expired = protocolError(
        () => getPendingProbe(probe.nonce, () => createdAt + 15 * 60_000),
        'PROCESS_BINDING_PENDING_EXPIRED'
    );
    assert.equal(
        (expired.details as { pendingRetained: boolean }).pendingRetained,
        false
    );

    const brokenNonce = 'c'.repeat(32);
    mkdirSync(pendingDir(), { recursive: true });
    writeFileSync(join(pendingDir(), `${brokenNonce}.json`), '{oops');
    protocolError(
        () => getPendingProbe(brokenNonce),
        'PROCESS_BINDING_PENDING_NOT_FOUND'
    );
    assert.deepEqual(fileNames(pendingDir()), []);
});

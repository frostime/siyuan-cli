import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createProcessObserver,
    type ObservationHost
} from '../src/workspace/binding/observation.ts';
import { captureWindowsAncestry } from '../src/workspace/binding/windows/capture.ts';
import type { ProcessNode } from '../src/workspace/binding/process-tree.ts';

interface NativeProcess {
    pid: number;
    ppid: number;
    name?: string;
    executablePath?: string | null;
    commandLine?: string | null;
    startId?: string;
}

function windowsHost(
    processes: NativeProcess[],
    psOutput?: string,
    counters = { cim: 0, ps: 0 }
): ObservationHost {
    return {
        platform: 'win32',
        pid: 500,
        run(command) {
            if (command === 'powershell.exe') {
                counters.cim += 1;
                return {
                    status: 0,
                    stdout: JSON.stringify({ processes }),
                    stderr: ''
                };
            }
            if (command === 'ps') {
                counters.ps += 1;
                return psOutput === undefined
                    ? { status: 1, stdout: '', stderr: '' }
                    : { status: 0, stdout: psOutput, stderr: '' };
            }
            return undefined;
        },
        readTextFile: () => undefined,
        readSymlink: () => undefined
    };
}

const NATIVE_TRUNCATED: NativeProcess[] = [
    {
        pid: 500,
        ppid: 999,
        name: 'node.exe',
        commandLine: 'node cli.mjs --token "do not serialize me"',
        startId: '5000'
    }
];

const HYBRID_PROCESSES: NativeProcess[] = [
    ...NATIVE_TRUNCATED,
    { pid: 600, ppid: 700, name: 'bash.exe', startId: '3000' },
    { pid: 700, ppid: 0, name: 'node.exe', startId: '1000' }
];

const OWNED_MSYS_TABLE = `
PID PPID PGID WINPID TTY UID STIME COMMAND
10 20 10 500 pty0 1 12:01 /usr/bin/node
20 1 20 600 pty0 1 12:00 /usr/bin/bash
`;

test('native ancestry reports a vanished creator instead of pretending to be complete', () => {
    const ancestry = captureWindowsAncestry(windowsHost(NATIVE_TRUNCATED));
    assert.deepEqual(
        ancestry.chain.map(({ pid }) => pid),
        [500]
    );
    assert.deepEqual(ancestry.termination, {
        kind: 'parent-missing',
        parentPid: 999
    });
    assert.ok(ancestry.chain[0]?.commandSignature?.startsWith('sha256:'));
    assert.ok(!JSON.stringify(ancestry).includes('do not serialize me'));
});

test('owned MSYS ancestry hands off to the same normalized Windows snapshot', () => {
    const ancestry = captureWindowsAncestry(
        windowsHost(HYBRID_PROCESSES, OWNED_MSYS_TABLE)
    );
    assert.deepEqual(
        ancestry.chain.map(({ pid }) => pid),
        [500, 600, 700]
    );
    assert.equal(ancestry.chain[0]?.ppid, 600);
    assert.equal(ancestry.chain[1]?.ppid, 700);
    assert.deepEqual(ancestry.termination, { kind: 'root' });
    assert.deepEqual(
        ancestry.chain.map(({ startId }) => startId),
        ['5000', '3000', '1000']
    );
});

test('MSYS logical ancestry accepts a mapped parent created after its child', () => {
    const execReplacedLogicalParent = HYBRID_PROCESSES.map((process) =>
        process.pid === 600 ? { ...process, startId: '6000' } : process
    );
    const ancestry = captureWindowsAncestry(
        windowsHost(execReplacedLogicalParent, OWNED_MSYS_TABLE)
    );

    assert.deepEqual(
        ancestry.chain.map(({ pid }) => pid),
        [500, 600, 700]
    );
    assert.deepEqual(ancestry.termination, { kind: 'root' });
});

test('a foreign MSYS table cannot replace native ancestry', () => {
    const foreign = OWNED_MSYS_TABLE.replace(' 500 ', ' 501 ');
    const ancestry = captureWindowsAncestry(
        windowsHost(NATIVE_TRUNCATED, foreign)
    );
    assert.deepEqual(
        ancestry.chain.map(({ pid }) => pid),
        [500]
    );
    assert.equal(ancestry.termination.kind, 'parent-missing');
});

test('missing MSYS rows and missing Windows handoff instances stay incomplete', () => {
    const missingLogicalParent = `
PID PPID PGID WINPID TTY UID STIME COMMAND
10 20 10 500 pty0 1 12:01 /usr/bin/node
`;
    const logicalFailure = captureWindowsAncestry(
        windowsHost(HYBRID_PROCESSES, missingLogicalParent)
    );
    assert.deepEqual(logicalFailure.termination, {
        kind: 'inconsistent',
        stage: 'msys-table',
        reason: 'logical parent 20 is missing'
    });

    const missingHandoff = captureWindowsAncestry(
        windowsHost(NATIVE_TRUNCATED, OWNED_MSYS_TABLE)
    );
    assert.equal(missingHandoff.termination.kind, 'inconsistent');
    assert.equal(
        missingHandoff.termination.kind === 'inconsistent'
            ? missingHandoff.termination.stage
            : undefined,
        'msys-handoff'
    );
});

test('scope inspection classifies PID reuse and uses only one CIM snapshot', () => {
    const counters = { cim: 0, ps: 0 };
    const observer = createProcessObserver(
        windowsHost(HYBRID_PROCESSES, OWNED_MSYS_TABLE, counters)
    );
    const reusedAnchor: ProcessNode = { pid: 700, ppid: 0, startId: 'old' };

    const result = observer.inspectAnchorsAndCurrentScope([reusedAnchor]);
    assert.equal(result.anchorInspections[0]?.state, 'stale');
    assert.equal(result.anchorInspections[0]?.reason, 'start-id-changed');
    assert.equal(result.ancestry, undefined);
    assert.deepEqual(counters, { cim: 1, ps: 0 });
});

test('scope inspection captures ancestry only for retained live or unknown anchors', () => {
    const counters = { cim: 0, ps: 0 };
    const observer = createProcessObserver(
        windowsHost(HYBRID_PROCESSES, OWNED_MSYS_TABLE, counters)
    );
    const liveAnchor: ProcessNode = { pid: 700, ppid: 0, startId: '1000' };
    const uncertainAnchor: ProcessNode = {
        pid: 600,
        ppid: 700,
        commandSignature: 'sha256:recorded-only'
    };

    const result = observer.inspectAnchorsAndCurrentScope([
        liveAnchor,
        uncertainAnchor
    ]);
    assert.deepEqual(
        result.anchorInspections.map(({ state }) => state),
        ['live', 'unknown']
    );
    assert.deepEqual(
        result.ancestry?.chain.map(({ pid }) => pid),
        [500, 600, 700]
    );
    assert.deepEqual(counters, { cim: 1, ps: 1 });
});

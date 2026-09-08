import test from 'node:test';
import assert from 'node:assert/strict';

import {
    findNearestCommonAncestor,
    inspectProcessInstance,
    matchProcessInstance,
    summarizeArgvTokens,
    type ProcessAncestry,
    type ProcessNode
} from '../src/workspace/binding/process-tree.ts';
import {
    createProcessObserver,
    type ObservationHost
} from '../src/workspace/binding/observation.ts';
import { CliError } from '../src/shared/errors.ts';

type ProcessTreeHost = ObservationHost;

function captureProcessAncestry(host: ProcessTreeHost): ProcessAncestry {
    return createProcessObserver(host).captureBindingAncestry();
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function fakeHost(
    overrides: Partial<ProcessTreeHost> & {
        platform: NodeJS.Platform;
        pid: number;
    }
): ProcessTreeHost {
    return {
        run: () => undefined,
        readTextFile: () => undefined,
        readSymlink: () => undefined,
        ...overrides
    };
}

function windowsHost(
    stdout: string | undefined,
    run?: ProcessTreeHost['run']
): ProcessTreeHost {
    return fakeHost({
        platform: 'win32',
        pid: 4242,
        run: run ?? (() => (stdout === undefined ? undefined : { status: 0, stdout, stderr: '' }))
    });
}

const WINDOWS_FIXTURE = JSON.stringify({
    chain: [
        {
            pid: 4242,
            ppid: 39872,
            name: 'node.exe',
            executablePath: 'C:/Program Files/nodejs/node.exe',
            commandLine: 'node.exe bin/siyuan.mjs current bind dev --token hunter2',
            startId: '639242267517896500'
        },
        {
            pid: 39872,
            ppid: 26344,
            name: 'bash.exe',
            executablePath: null,
            commandLine: null,
            startId: '639242267517105190'
        }
    ]
});

/** Build a /proc/<pid>/stat body: state(0) ppid(1) ... starttime(19). */
function linuxStat(pid: number, comm: string, ppid: number, starttime: number): string {
    const fields = ['S', String(ppid), ...Array<string>(17).fill('0'), String(starttime)];
    return `${pid} (${comm}) ${fields.join(' ')}`;
}

function linuxHost(
    files: Record<string, string>,
    links: Record<string, string> = {},
    pid = 500
): ProcessTreeHost {
    return fakeHost({
        platform: 'linux',
        pid,
        readTextFile: (path) => files[path],
        readSymlink: (path) => links[path]
    });
}

function assertCaptureUnavailable(host: ProcessTreeHost) {
    assert.throws(
        () => captureProcessAncestry(host),
        (error: unknown) =>
            error instanceof CliError && error.errorType === 'PROCESS_TREE_UNAVAILABLE'
    );
}

// ─── Instance matching ───────────────────────────────────────────────────────

test('strong identity matches the same instance and rejects PID reuse', () => {
    const a: ProcessNode = { pid: 7, ppid: 1, startId: 'start-1' };
    assert.equal(
        matchProcessInstance(a, { pid: 7, ppid: 1, startId: 'start-1' })?.strength,
        'pid+start'
    );
    assert.equal(
        matchProcessInstance(a, { pid: 7, ppid: 1, startId: 'start-2' }),
        undefined
    );
});

test('degraded matching requires a compatible signature and never falls back to bare PID', () => {
    const a: ProcessNode = { pid: 7, ppid: 1, commandSignature: 'sha256:x' };
    assert.equal(
        matchProcessInstance(a, { pid: 7, ppid: 1, commandSignature: 'sha256:x' })
            ?.strength,
        'pid+signature'
    );
    assert.equal(
        matchProcessInstance(a, { pid: 7, ppid: 1, commandSignature: 'sha256:y' }),
        undefined
    );
    assert.equal(matchProcessInstance(a, { pid: 7, ppid: 1 }), undefined);
    assert.equal(
        matchProcessInstance(a, { pid: 7, ppid: 1, startId: 'start-9' }),
        undefined
    );
});

// ─── Nearest common ancestor ─────────────────────────────────────────────────

test('nearest common ancestor skips a reused PID and stops at the next shared instance', () => {
    const chainA: ProcessNode[] = [
        { pid: 100, ppid: 7, startId: 'a-self' },
        { pid: 7, ppid: 2, startId: 'old-shell' },
        { pid: 2, ppid: 0, startId: 'root' }
    ];
    const chainB: ProcessNode[] = [
        { pid: 200, ppid: 7, startId: 'b-self' },
        { pid: 7, ppid: 2, startId: 'new-shell' },
        { pid: 2, ppid: 0, startId: 'root' }
    ];
    const match = findNearestCommonAncestor(chainA, chainB);
    assert.equal(match?.node.pid, 2);
    assert.equal(match?.strength, 'pid+start');
});

test('nearest common ancestor can match degraded instances by command signature', () => {
    const chainA: ProcessNode[] = [
        { pid: 100, ppid: 7, startId: 'a-self' },
        { pid: 7, ppid: 2, commandSignature: 'sha256:shell' }
    ];
    const chainB: ProcessNode[] = [
        { pid: 200, ppid: 7, startId: 'b-self' },
        { pid: 7, ppid: 2, commandSignature: 'sha256:shell' }
    ];
    const match = findNearestCommonAncestor(chainA, chainB);
    assert.equal(match?.node.pid, 7);
    assert.equal(match?.strength, 'pid+signature');
});

test('instance inspection proves PID reuse only from authoritative start identity', () => {
    const anchor: ProcessNode = {
        pid: 7,
        ppid: 1,
        startId: 'old',
        commandSignature: 'sha256:same'
    };
    assert.equal(
        inspectProcessInstance(
            anchor,
            { pid: 7, ppid: 1, startId: 'new', commandSignature: 'sha256:same' },
            true
        ).state,
        'stale'
    );
    assert.equal(
        inspectProcessInstance(
            { pid: 8, ppid: 1, commandSignature: 'sha256:old' },
            { pid: 8, ppid: 1, commandSignature: 'sha256:new' },
            true
        ).state,
        'unknown'
    );
    assert.equal(inspectProcessInstance(anchor, undefined, true).state, 'stale');
    assert.equal(inspectProcessInstance(anchor, undefined, false).state, 'unknown');
});

test('nearest common ancestor returns undefined for disjoint chains', () => {
    assert.equal(
        findNearestCommonAncestor(
            [{ pid: 1, ppid: 0, startId: 'a' }],
            [{ pid: 9, ppid: 0, startId: 'b' }]
        ),
        undefined
    );
    assert.equal(findNearestCommonAncestor([], []), undefined);
});

// ─── Command summary redaction ───────────────────────────────────────────────

test('command summaries redact secret flag values and long random tokens', () => {
    const summary = summarizeArgvTokens([
        'node',
        'cli.mjs',
        '--token',
        'hunter2',
        '--api-key=zzz123',
        'fine-arg',
        'sk-0123456789abcdef0123456789abcdef0123'
    ]);
    assert.ok(summary.includes('--token <redacted>'), summary);
    assert.ok(summary.includes('--api-key=<redacted>'), summary);
    assert.ok(summary.includes('fine-arg'), summary);
    assert.ok(!summary.includes('hunter2'), summary);
    assert.ok(!summary.includes('zzz123'), summary);
    assert.ok(!summary.includes('sk-0123456789'), summary);
});

// ─── Windows capture ─────────────────────────────────────────────────────────

test('Windows CIM capture maps chain entries and drops raw command lines', () => {
    const ancestry = captureProcessAncestry(windowsHost(WINDOWS_FIXTURE));
    assert.equal(ancestry.platform, 'win32');
    assert.deepEqual(
        ancestry.chain.map((node) => node.pid),
        [4242, 39872]
    );
    const self = ancestry.chain[0]!;
    assert.equal(self.startId, '639242267517896500');
    assert.equal(self.executablePath, 'C:/Program Files/nodejs/node.exe');
    assert.ok(self.commandSignature?.startsWith('sha256:'));
    assert.ok(!self.commandSummary!.includes('hunter2'), self.commandSummary);
    assert.ok(self.commandSummary!.includes('<redacted>'), self.commandSummary);
    const parent = ancestry.chain[1]!;
    assert.equal(parent.name, 'bash.exe');
    assert.equal(parent.commandSignature, undefined);
    const serialized = JSON.stringify(ancestry);
    assert.ok(!serialized.includes('hunter2'));
    assert.ok(!serialized.includes('commandLine'));
});

test('Windows capture failures raise PROCESS_TREE_UNAVAILABLE instead of degrading', () => {
    // Spawn failure
    assertCaptureUnavailable(windowsHost(undefined));
    // Non-zero exit
    assertCaptureUnavailable(
        windowsHost('', () => ({ status: 1, stdout: '', stderr: 'boom' }))
    );
    // Malformed JSON
    assertCaptureUnavailable(windowsHost('not json'));
    // Empty chain
    assertCaptureUnavailable(windowsHost(JSON.stringify({ chain: [] })));
    // Chain does not start at the requested PID
    assertCaptureUnavailable(
        windowsHost(
            JSON.stringify({ chain: [{ pid: 9999, ppid: 1, name: 'x.exe' }] })
        )
    );
});

test('unsupported platforms raise PROCESS_TREE_UNSUPPORTED', () => {
    assert.throws(
        () => captureProcessAncestry(fakeHost({ platform: 'freebsd', pid: 1 })),
        (error: unknown) =>
            error instanceof CliError && error.errorType === 'PROCESS_TREE_UNSUPPORTED'
    );
});

// ─── Linux capture ───────────────────────────────────────────────────────────

test('Linux /proc capture walks ancestry with start identity and signature', () => {
    const ancestry = captureProcessAncestry(
        linuxHost(
            {
                '/proc/500/stat': linuxStat(500, 'node', 400, 123456),
                '/proc/500/cmdline': 'node\x00bin/siyuan.mjs\x00current\x00bind\x00dev\x00',
                '/proc/400/stat': linuxStat(400, 'bash', 1, 42)
                // No /proc/400/cmdline: the parent keeps a start identity but no signature.
            },
            { '/proc/500/exe': '/usr/bin/node' }
        )
    );
    assert.equal(ancestry.platform, 'linux');
    assert.deepEqual(
        ancestry.chain.map((node) => node.pid),
        [500, 400]
    );
    const self = ancestry.chain[0]!;
    assert.equal(self.name, 'node');
    assert.equal(self.ppid, 400);
    assert.equal(self.startId, '123456');
    assert.equal(self.executablePath, '/usr/bin/node');
    assert.ok(self.commandSignature?.startsWith('sha256:'));
    const parent = ancestry.chain[1]!;
    assert.equal(parent.name, 'bash');
    assert.equal(parent.startId, '42');
    assert.equal(parent.commandSignature, undefined);
});

test('Linux stat parsing survives a comm field containing ") "', () => {
    const ancestry = captureProcessAncestry(
        linuxHost({ '/proc/600/stat': linuxStat(600, 'wor) ld', 1, 777) }, {}, 600)
    );
    const self = ancestry.chain[0]!;
    assert.equal(self.name, 'wor) ld');
    assert.equal(self.ppid, 1);
    assert.equal(self.startId, '777');
});

test('Linux capture stops on a PID cycle instead of looping forever', () => {
    const ancestry = captureProcessAncestry(
        linuxHost({
            '/proc/700/stat': linuxStat(700, 'a', 800, 11),
            '/proc/800/stat': linuxStat(800, 'b', 700, 22)
        }, {}, 700)
    );
    assert.deepEqual(
        ancestry.chain.map((node) => node.pid),
        [700, 800]
    );
    assert.deepEqual(ancestry.termination, { kind: 'cycle', pid: 700 });
});

test('Linux capture fails explicitly when the self process is unreadable', () => {
    assertCaptureUnavailable(linuxHost({}, {}, 500));
});

// ─── macOS capture ───────────────────────────────────────────────────────────

test('macOS ps capture is best-effort with degraded start identity', () => {
    const host = fakeHost({
        platform: 'darwin',
        pid: 900,
        run: (command, args) => {
            if (command === 'ps' && args[1] === 'ppid=,lstart=,command=') {
                return args[3] === '900'
                    ? {
                          status: 0,
                          stdout: '  400 Fri Sep  5 17:00:00 2026 /usr/local/bin/node run.js --token hunter2\n',
                          stderr: ''
                      }
                    : {
                          status: 0,
                          stdout: '1 Sat Sep  6 08:00:00 2026 /sbin/launchd\n',
                          stderr: ''
                      };
            }
            if (command === 'ps' && args[1] === 'comm=') {
                return { status: 0, stdout: '/usr/local/bin/node\n', stderr: '' };
            }
            return undefined;
        }
    });
    const ancestry = captureProcessAncestry(host);
    assert.deepEqual(
        ancestry.chain.map((node) => node.pid),
        [900, 400, 1]
    );
    const self = ancestry.chain[0]!;
    assert.equal(self.ppid, 400);
    assert.equal(self.startId, 'Fri Sep 5 17:00:00 2026');
    assert.equal(self.executablePath, '/usr/local/bin/node');
    assert.equal(self.name, 'node');
    assert.ok(self.commandSignature?.startsWith('sha256:'));
    assert.ok(!JSON.stringify(ancestry).includes('hunter2'));
});

test('macOS capture ends the chain at an ancestor that ps cannot read', () => {
    const host = fakeHost({
        platform: 'darwin',
        pid: 900,
        run: (command, args) => {
            if (
                command === 'ps' &&
                args[1] === 'ppid=,lstart=,command=' &&
                args[3] === '900'
            ) {
                return {
                    status: 0,
                    stdout: '  400 Fri Sep  5 17:00:00 2026 node run.js\n',
                    stderr: ''
                };
            }
            return undefined; // Parent read fails: the ancestor has likely exited.
        }
    });
    const ancestry = captureProcessAncestry(host);
    assert.deepEqual(
        ancestry.chain.map((node) => node.pid),
        [900]
    );
    assert.deepEqual(ancestry.termination, {
        kind: 'parent-missing',
        parentPid: 400
    });
});

// ─── Real-host smoke (runs the actual platform adapter) ─────────────────────

test('real host smoke: captures the running process ancestry', {
    skip: process.platform !== 'win32' && process.platform !== 'linux'
}, () => {
    const ancestry = captureProcessAncestry();
    assert.equal(ancestry.chain[0]!.pid, process.pid);
    assert.ok(ancestry.chain.length >= 1);
    for (const node of ancestry.chain) {
        assert.equal(typeof node.ppid, 'number');
        assert.ok(
            node.commandSignature === undefined ||
                node.commandSignature.startsWith('sha256:')
        );
        assert.ok(node.startId === undefined || node.startId.length > 0);
    }
});

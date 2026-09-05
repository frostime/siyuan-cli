import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    confirmPendingProbe,
    createPendingProbe,
    findActiveBinding,
    unbindProcessScope
} from '../src/workspace/process-binding.ts';
import { CliError } from '../src/shared/errors.ts';
import type { ProcessNode, ProcessTreeHost } from '../src/workspace/process-tree.ts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Build a /proc/<pid>/stat body: state(0) ppid(1) ... starttime(19). */
function linuxStat(pid: number, comm: string, ppid: number, starttime: number): string {
    const fields = ['S', String(ppid), ...Array<string>(17).fill('0'), String(starttime)];
    return `${pid} (${comm}) ${fields.join(' ')}`;
}

interface FakeProcess {
    pid: number;
    ppid: number;
    name: string;
    starttime: number;
    argv?: string[];
}

/** Linux host whose /proc contains exactly the given processes. */
function fakeLinuxHost(selfPid: number, processes: FakeProcess[]): ProcessTreeHost {
    const files: Record<string, string> = {};
    for (const proc of processes) {
        files[`/proc/${proc.pid}/stat`] = linuxStat(proc.pid, proc.name, proc.ppid, proc.starttime);
        if (proc.argv) {
            files[`/proc/${proc.pid}/cmdline`] = proc.argv.join('\0') + '\0';
        }
    }
    return {
        platform: 'linux',
        pid: selfPid,
        run: () => undefined,
        readTextFile: (path) => files[path],
        readSymlink: () => undefined
    };
}

/** An "agent scope": one long-lived agent process (200) under init. */
function scopeHost(selfPid: number, agentStarttime = 2000, argv?: string[]): ProcessTreeHost {
    return fakeLinuxHost(selfPid, [
        { pid: selfPid, ppid: 200, name: 'cli', starttime: agentStarttime + selfPid, argv },
        { pid: 200, ppid: 1, name: 'agent', starttime: agentStarttime, argv },
        { pid: 1, ppid: 0, name: 'init', starttime: 1 }
    ]);
}

function pendingDir(configRoot: string): string {
    return join(configRoot, 'process-binding', 'pending');
}

function bindingsDir(configRoot: string): string {
    return join(configRoot, 'process-binding', 'bindings');
}

function fileNames(dir: string): string[] {
    try {
        return readdirSync(dir);
    } catch {
        return [];
    }
}

function assertProtocolError(fn: () => unknown, errorType: string) {
    assert.throws(
        fn,
        (error: unknown) => error instanceof CliError && error.errorType === errorType
    );
}

// Per-test isolated config root; node:test runs tests in a file sequentially.
let configRoot: string;
let previousConfigRoot: string | undefined;

test.before(() => {
    previousConfigRoot = process.env['SIYUAN_CLI_CONFIG'];
});

test.after(() => {
    if (previousConfigRoot === undefined) delete process.env['SIYUAN_CLI_CONFIG'];
    else process.env['SIYUAN_CLI_CONFIG'] = previousConfigRoot;
});

test.beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), 'siyuan-procbinding-'));
    process.env['SIYUAN_CLI_CONFIG'] = configRoot;
});

test.afterEach(() => {
    rmSync(configRoot, { recursive: true, force: true });
});

// ─── Two-step protocol ───────────────────────────────────────────────────────

test('bind + confirm anchors the nearest common ancestor and consumes the nonce', () => {
    const bindHost = scopeHost(101);
    const probe = createPendingProbe('dev', bindHost);
    assert.equal(probe.workspace, 'dev');
    assert.equal(probe.selfPid, 101);
    assert.match(probe.nonce, /^[0-9a-f]{32}$/);
    assert.equal(fileNames(pendingDir(configRoot)).length, 1);

    const binding = confirmPendingProbe(probe.nonce, scopeHost(102));
    assert.equal(binding.workspace, 'dev');
    assert.equal(binding.anchor.pid, 200);
    assert.equal(binding.anchor.startId, '2000');
    assert.equal(binding.cwd, process.cwd());
    // Nonce consumed, binding persisted.
    assert.deepEqual(fileNames(pendingDir(configRoot)), []);
    assert.equal(fileNames(bindingsDir(configRoot)).length, 1);
});

test('confirm from the same process as bind is rejected', () => {
    const bindHost = scopeHost(101);
    const probe = createPendingProbe('dev', bindHost);
    // Same pid as the bind invocation, different ancestry position.
    assertProtocolError(
        () => confirmPendingProbe(probe.nonce, scopeHost(101)),
        'PROCESS_BINDING_SAME_CALL'
    );
    // The pending probe is kept: a real sibling call may still confirm it.
    assert.equal(fileNames(pendingDir(configRoot)).length, 1);
});

test('confirm without a pending nonce fails explicitly', () => {
    assertProtocolError(
        () => confirmPendingProbe('deadbeef', scopeHost(102)),
        'PROCESS_BINDING_PENDING_NOT_FOUND'
    );
});

test('expired pending probes are deleted and reported as expired', () => {
    const bindTime = Date.now();
    const probe = createPendingProbe('dev', scopeHost(101), () => bindTime);
    const fifteenMinutesLater = bindTime + 16 * 60_000;
    assertProtocolError(
        () => confirmPendingProbe(probe.nonce, scopeHost(102), () => fifteenMinutesLater),
        'PROCESS_BINDING_PENDING_EXPIRED'
    );
    assert.deepEqual(fileNames(pendingDir(configRoot)), []);
});

test('bind and confirm sharing only the machine root fail without writing a binding', () => {
    // The two scopes have no common ancestor except init (pid 1): anchoring
    // there would be machine-global, so confirm must fail.
    const probe = createPendingProbe(
        'dev',
        fakeLinuxHost(101, [
            { pid: 101, ppid: 300, name: 'cli', starttime: 11 },
            { pid: 300, ppid: 1, name: 'other-scope', starttime: 22 },
            { pid: 1, ppid: 0, name: 'init', starttime: 1 }
        ])
    );
    assertProtocolError(
        () => confirmPendingProbe(probe.nonce, scopeHost(102)),
        'PROCESS_BINDING_NO_COMMON_ANCESTOR'
    );
    // Pending kept for a retry from a proper sibling call; nothing bound.
    assert.equal(fileNames(pendingDir(configRoot)).length, 1);
    assert.deepEqual(fileNames(bindingsDir(configRoot)), []);
});

test('re-confirming the same scope replaces the previous binding', () => {
    // First binding anchored on the agent process (200).
    const first = confirmPendingProbe(
        createPendingProbe('dev', scopeHost(101)).nonce,
        scopeHost(102)
    );
    assert.equal(first.anchor.pid, 200);

    // Second bind/confirm pair shares a deeper common ancestor: a shell (250)
    // under the agent that hosted both calls.
    const shellScope = (selfPid: number): ProcessTreeHost =>
        fakeLinuxHost(selfPid, [
            { pid: selfPid, ppid: 250, name: 'cli', starttime: 3000 + selfPid },
            { pid: 250, ppid: 200, name: 'shell', starttime: 3000 },
            { pid: 200, ppid: 1, name: 'agent', starttime: 2000 },
            { pid: 1, ppid: 0, name: 'init', starttime: 1 }
        ]);
    const second = confirmPendingProbe(
        createPendingProbe('home', shellScope(111)).nonce,
        shellScope(112)
    );
    assert.equal(second.anchor.pid, 250);

    // The new binding covers the whole confirm scope, so the old agent-200
    // record was replaced and exactly one binding file remains.
    assert.equal(fileNames(bindingsDir(configRoot)).length, 1);
    const active = findActiveBinding(shellScope(113));
    assert.equal(active?.binding.workspace, 'home');
    assert.equal(active?.match.node.pid, 250);
});

// ─── Resolution side ─────────────────────────────────────────────────────────

test('findActiveBinding matches the anchor process in the current ancestry', () => {
    confirmPendingProbe(createPendingProbe('dev', scopeHost(101)).nonce, scopeHost(102));

    const active = findActiveBinding(scopeHost(103));
    assert.equal(active?.binding.workspace, 'dev');
    assert.equal(active?.match.strength, 'pid+start');
    assert.equal(active?.match.node.pid, 200);
});

test('a reused PID with a different start identity does not match', () => {
    confirmPendingProbe(createPendingProbe('dev', scopeHost(101)).nonce, scopeHost(102));

    // Same agent PID (200) but a different start identity: the original
    // process is gone and the PID was reused.
    const reused = fakeLinuxHost(103, [
        { pid: 103, ppid: 200, name: 'cli', starttime: 9000 },
        { pid: 200, ppid: 1, name: 'agent', starttime: 9999 },
        { pid: 1, ppid: 0, name: 'init', starttime: 1 }
    ]);
    assert.equal(findActiveBinding(reused), undefined);
});

test('a scope that never contained the anchor does not see the binding', () => {
    confirmPendingProbe(createPendingProbe('dev', scopeHost(101)).nonce, scopeHost(102));
    const otherScope = fakeLinuxHost(104, [
        { pid: 104, ppid: 300, name: 'cli', starttime: 41 },
        { pid: 300, ppid: 1, name: 'unrelated', starttime: 42 },
        { pid: 1, ppid: 0, name: 'init', starttime: 1 }
    ]);
    assert.equal(findActiveBinding(otherScope), undefined);
});

test('a binding without a start identity still resolves via command signature', () => {
    // Hand-written record: anchor observable only by pid + command signature.
    // The signature must match what the fake scope's argv produces so the
    // degraded (signature-based) comparison succeeds.
    const commandSignature = `sha256:${createHash('sha256').update('node\0cli.mjs').digest('hex')}`;
    const bindings = join(configRoot, 'process-binding', 'bindings');
    mkdirSync(bindings, { recursive: true });
    const binding = {
        workspace: 'dev',
        anchor: {
            pid: 200,
            ppid: 1,
            commandSignature
        } satisfies Partial<ProcessNode> as ProcessNode,
        boundAt: new Date().toISOString()
    };
    writeFileSync(join(bindings, '200-manual.json'), JSON.stringify(binding));

    const matchingScope = fakeLinuxHost(103, [
        {
            pid: 103,
            ppid: 200,
            name: 'cli',
            starttime: 51,
            argv: ['node', 'cli.mjs']
        },
        {
            pid: 200,
            ppid: 1,
            name: 'agent',
            starttime: 52,
            argv: ['node', 'cli.mjs']
        },
        { pid: 1, ppid: 0, name: 'init', starttime: 1 }
    ]);
    const active = findActiveBinding(matchingScope);
    assert.equal(active?.binding.workspace, 'dev');
    assert.equal(active?.match.strength, 'pid+signature');
});

// ─── Unbind ──────────────────────────────────────────────────────────────────

test('unbind removes bindings for the current scope and cancels pending probes', () => {
    const probe = createPendingProbe('dev', scopeHost(101));
    confirmPendingProbe(probe.nonce, scopeHost(102));

    const result = unbindProcessScope(scopeHost(103));
    assert.equal(result.removed, 1);
    assert.equal(findActiveBinding(scopeHost(103)), undefined);

    // A later unbind in the same scope finds nothing.
    assert.equal(unbindProcessScope(scopeHost(104)).removed, 0);
});

test('unbind cancels a pending probe so confirm can no longer pair', () => {
    const probe = createPendingProbe('dev', scopeHost(101));
    const result = unbindProcessScope(scopeHost(102));
    assert.equal(result.pendingRemoved, 1);
    assertProtocolError(
        () => confirmPendingProbe(probe.nonce, scopeHost(103)),
        'PROCESS_BINDING_PENDING_NOT_FOUND'
    );
});

// ─── State self-healing ──────────────────────────────────────────────────────

test('unreadable or malformed state files are removed and ignored', () => {
    const bindings = bindingsDir(configRoot);
    const pending = pendingDir(configRoot);
    mkdirSync(bindings, { recursive: true });
    mkdirSync(pending, { recursive: true });
    writeFileSync(join(bindings, 'garbage.json'), 'not json{');
    writeFileSync(join(bindings, 'wrong-shape.json'), JSON.stringify({ hello: 1 }));
    const anchor = { pid: 200, ppid: 1, startId: '2000' };
    writeFileSync(
        join(bindings, 'valid.json'),
        JSON.stringify({
            workspace: 'dev',
            anchor,
            boundAt: new Date().toISOString()
        })
    );

    const active = findActiveBinding(scopeHost(103));
    assert.equal(active?.binding.workspace, 'dev');
    assert.deepEqual(fileNames(bindings), ['valid.json']);

    // A malformed pending file for a requested nonce reads as "not found".
    writeFileSync(join(pending, 'broken-nonce.json'), '{oops');
    assertProtocolError(
        () => confirmPendingProbe('broken-nonce', scopeHost(102)),
        'PROCESS_BINDING_PENDING_NOT_FOUND'
    );
    assert.deepEqual(fileNames(pending), []);
});

test('binding records round-trip through the state file', () => {
    confirmPendingProbe(createPendingProbe('dev', scopeHost(101)).nonce, scopeHost(102));
    const stored = JSON.parse(
        readFileSync(join(bindingsDir(configRoot), fileNames(bindingsDir(configRoot))[0]!), 'utf8')
    );
    assert.equal(stored.workspace, 'dev');
    assert.equal(stored.anchor.pid, 200);
    assert.equal(typeof stored.boundAt, 'string');
});

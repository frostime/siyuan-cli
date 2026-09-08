import test from 'node:test';
import assert from 'node:assert/strict';

import {
    captureOwnedMsysProcessTable,
    parseMsysProcessTable,
    walkMsysProcessTable,
    type MsysCommandHost
} from '../src/workspace/binding/windows/msys-process-table.ts';

const GIT_PS_3_4 = `
      PID    PPID    PGID     WINPID   TTY         UID    STIME COMMAND
O     1789    1782    1789      55376  pty0     197609 12:01:02 /usr/bin/node
      1782       1    1782      57520  pty0     197609 12:00:00 /usr/bin/bash
`;

const MSYS2_PS_3_6 = `
S      UID     PID    PPID    PGID     WINPID   TTY   STIME COMMAND
O   197609     811     700     811      44000  pty1   12:01 /usr/bin/node
S   197609     700       1     700      33000  pty1   12:00 /usr/bin/bash
`;

test('header-driven parser accepts Git ps 3.4 rows with an optional status prefix', () => {
    const table = parseMsysProcessTable(GIT_PS_3_4);
    assert.deepEqual(table, {
        entries: [
            { pid: 1789, ppid: 1782, winPid: 55376, defunct: false },
            { pid: 1782, ppid: 1, winPid: 57520, defunct: false }
        ],
        malformedRows: 0
    });
    assert.deepEqual(walkMsysProcessTable(table!, 55376), {
        kind: 'complete',
        chain: table!.entries
    });
});

test('header-driven parser accepts MSYS2 ps 3.6 with an advertised status column', () => {
    const table = parseMsysProcessTable(MSYS2_PS_3_6);
    assert.deepEqual(
        table?.entries.map(({ pid, ppid, winPid }) => ({ pid, ppid, winPid })),
        [
            { pid: 811, ppid: 700, winPid: 44000 },
            { pid: 700, ppid: 1, winPid: 33000 }
        ]
    );
    assert.equal(walkMsysProcessTable(table!, 44000).kind, 'complete');
});

test('capture rejects a foreign process table and requests untruncated output', () => {
    let requestedEnvironment: Record<string, string | undefined> | undefined;
    const host: MsysCommandHost = {
        run(command, args, options) {
            assert.equal(command, 'ps');
            assert.deepEqual(args, ['-e', '-l']);
            requestedEnvironment = options?.environment;
            return { status: 0, stdout: GIT_PS_3_4, stderr: '' };
        }
    };

    assert.equal(captureOwnedMsysProcessTable(host, 99999), undefined);
    assert.equal(requestedEnvironment?.['COLUMNS'], '4096');
    assert.ok(captureOwnedMsysProcessTable(host, 55376));
});

test('missing or malformed logical ancestors remain explicitly inconsistent', () => {
    const table = parseMsysProcessTable(`
PID PPID PGID WINPID TTY UID STIME COMMAND
100 200 100 50000 ? 1 00:00 node
this row is malformed
`)!;
    assert.equal(table.malformedRows, 1);
    const result = walkMsysProcessTable(table, 50000);
    assert.equal(result.kind, 'inconsistent');
    if (result.kind === 'inconsistent') {
        assert.match(result.reason, /missing from an incomplete table/);
    }
});

test('defunct rows and duplicate ownership cannot produce a complete walk', () => {
    const defunct = parseMsysProcessTable(`
PID PPID PGID WINPID TTY UID STIME COMMAND
100 1 100 50000 ? 1 00:00 <defunct>
`)!;
    assert.equal(walkMsysProcessTable(defunct, 50000).kind, 'inconsistent');

    const duplicateOwner = parseMsysProcessTable(`
PID PPID PGID WINPID TTY UID STIME COMMAND
100 1 100 50000 ? 1 00:00 node
101 1 101 50000 ? 1 00:00 node
`)!;
    assert.equal(
        walkMsysProcessTable(duplicateOwner, 50000).kind,
        'inconsistent'
    );
});

test('an unverifiable header is not treated as an empty MSYS table', () => {
    assert.equal(
        parseMsysProcessTable('PID PPID COMMAND\n1 0 init\n'),
        undefined
    );
});

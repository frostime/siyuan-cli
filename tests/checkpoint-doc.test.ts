import test from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tool } from '../src/tool/builtins/checkpoint-doc.ts';
import { CliError, ExitCode } from '../src/shared/errors.ts';

const DOC_ID = '20241016135347-zlrn2cz';

type FakeContextOptions = {
    version: string;
    dryRun?: boolean;
    historyError?: Error;
    historyWouldRequestApproval?: boolean;
    localReadError?: Error;
};

function makeContext(options: FakeContextOptions) {
    const calls: Array<{ id: string; payload: unknown }> = [];
    const ctx = {
        args: { dryRun: options.dryRun },
        async callEndpoint(id: string, payload: unknown) {
            calls.push({ id, payload });
            if (id === 'system.version') return options.version;
            if (id === 'block.getBlockKramdown') {
                if (options.localReadError) throw options.localReadError;
                return { id: DOC_ID, kramdown: '# Checkpoint source' };
            }
            if (id === 'history.createDocHistory') {
                if (options.historyError) throw options.historyError;
                if (options.dryRun) {
                    return {
                        dryRun: true,
                        wouldRequestApproval:
                            options.historyWouldRequestApproval ?? false
                    };
                }
                return null;
            }
            if (id === 'query.sql') {
                const stmt = (payload as { stmt: string }).stmt;
                if (stmt.includes('FROM blocks WHERE id')) {
                    return [
                        {
                            id: DOC_ID,
                            box: 'notebook',
                            path: `/${DOC_ID}.sy`,
                            hpath: '/Checkpoint test',
                            content: 'Checkpoint test',
                            type: 'd'
                        }
                    ];
                }
                return [];
            }
            throw new Error(`Unexpected endpoint: ${id}`);
        }
    } as any;
    return { ctx, calls };
}

function checkpointDetails(result: Awaited<ReturnType<typeof tool.run>>) {
    return result.details as {
        kernelVersion: string;
        kernelHistory: {
            status: string;
            wouldRequestApproval?: boolean;
        };
        localRecovery: { status: string; dir: string };
        dir: string;
        files: { content: string; recovery: string; readme: string };
        stats: { blockCount: number };
    };
}

test('checkpoint-doc schema exposes its write side effects and read/write document guards', () => {
    assert.deepEqual(tool.tags, ['write', 'util']);
    assert.deepEqual(tool.classification, {
        action: 'write',
        domain: 'content',
        cardinality: 'single'
    });
    assert.deepEqual(tool.guard?.payloadTargets, [
        { path: 'id', kind: 'id', access: 'read' },
        { path: 'id', kind: 'id', access: 'write' }
    ]);
});

test('checkpoint-doc creates kernel history and the existing local package on supported kernels', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'siyuan-checkpoint-supported-'));
    const { ctx, calls } = makeContext({ version: '3.7.0' });

    try {
        const result = await tool.run(ctx, { id: DOC_ID, outDir });
        const details = checkpointDetails(result);

        assert.equal(
            calls.filter((call) => call.id === 'history.createDocHistory')
                .length,
            1
        );
        assert.equal(details.kernelHistory.status, 'created');
        assert.equal(details.localRecovery.status, 'created');
        assert.equal(details.stats.blockCount, 0);
        assert.equal(
            readFileSync(details.files.content, 'utf8'),
            '# Checkpoint source'
        );
        assert.equal(
            JSON.parse(readFileSync(details.files.recovery, 'utf8'))
                .checkpointVersion,
            1
        );
        assert.match(
            readFileSync(details.files.readme, 'utf8'),
            /recovery package/
        );
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
});

test('checkpoint-doc degrades to local-only with a warning on older kernels', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'siyuan-checkpoint-legacy-'));
    const { ctx, calls } = makeContext({ version: '3.6.9' });

    try {
        const result = await tool.run(ctx, { id: DOC_ID, outDir });
        const details = checkpointDetails(result);

        assert.equal(
            calls.filter((call) => call.id === 'history.createDocHistory')
                .length,
            0
        );
        assert.equal(details.kernelHistory.status, 'unavailable');
        assert.equal(details.localRecovery.status, 'created');
        assert.match(result.warnings?.[0] ?? '', /requires SiYuan >=3\.7\.0/);
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
});

test('checkpoint-doc dry-run validates the history plan without filesystem writes', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'siyuan-checkpoint-dry-run-'));
    const { ctx, calls } = makeContext({
        version: '3.7.1',
        dryRun: true,
        historyWouldRequestApproval: true
    });

    try {
        const result = await tool.run(ctx, { id: DOC_ID, outDir });
        const details = checkpointDetails(result);

        assert.equal(
            calls.filter((call) => call.id === 'history.createDocHistory')
                .length,
            1
        );
        assert.equal(details.kernelHistory.status, 'planned');
        assert.equal(details.kernelHistory.wouldRequestApproval, true);
        assert.equal(details.localRecovery.status, 'planned');
        assert.deepEqual(readdirSync(outDir), []);
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
});

test('checkpoint-doc dry-run surfaces history guard rejection without writes', async () => {
    const outDir = mkdtempSync(
        join(tmpdir(), 'siyuan-checkpoint-dry-run-denied-')
    );
    const denial = new CliError(
        ExitCode.PERMISSION,
        'ENDPOINT_DENIED',
        'history denied'
    );
    const { ctx, calls } = makeContext({
        version: '3.7.1',
        dryRun: true,
        historyError: denial
    });

    try {
        await assert.rejects(
            () => tool.run(ctx, { id: DOC_ID, outDir }),
            (error: unknown) => error === denial
        );
        assert.equal(
            calls.filter((call) => call.id === 'history.createDocHistory')
                .length,
            1
        );
        assert.deepEqual(readdirSync(outDir), []);
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
});

test('checkpoint-doc dry-run reports the old-kernel fallback without writes', async () => {
    const outDir = mkdtempSync(
        join(tmpdir(), 'siyuan-checkpoint-dry-run-legacy-')
    );
    const { ctx, calls } = makeContext({ version: '3.6.9', dryRun: true });

    try {
        const result = await tool.run(ctx, { id: DOC_ID, outDir });
        const details = checkpointDetails(result);

        assert.equal(
            calls.filter((call) => call.id === 'history.createDocHistory')
                .length,
            0
        );
        assert.equal(details.kernelHistory.status, 'unavailable');
        assert.equal(details.localRecovery.status, 'planned');
        assert.match(result.warnings?.[0] ?? '', /local recovery package only/);
        assert.deepEqual(readdirSync(outDir), []);
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
});

test('checkpoint-doc preserves the local package and reports layer status when history fails', async () => {
    const outDir = mkdtempSync(
        join(tmpdir(), 'siyuan-checkpoint-history-fail-')
    );
    const { ctx } = makeContext({
        version: '3.7.0',
        historyError: new Error('history unavailable')
    });

    try {
        await assert.rejects(
            () => tool.run(ctx, { id: DOC_ID, outDir }),
            (error: unknown) => {
                assert.ok(error instanceof CliError);
                assert.equal(error.errorType, 'CHECKPOINT_PARTIAL_FAILURE');
                const details = error.details as {
                    kernelHistory: { status: string };
                    localRecovery: { status: string; dir: string };
                };
                assert.equal(details.kernelHistory.status, 'failed');
                assert.equal(details.localRecovery.status, 'created');
                assert.equal(existsSync(details.localRecovery.dir), true);
                return true;
            }
        );
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
});

test('checkpoint-doc still preserves kernel history when local package preparation fails', async () => {
    const outDir = mkdtempSync(
        join(tmpdir(), 'siyuan-checkpoint-local-read-fail-')
    );
    const { ctx, calls } = makeContext({
        version: '3.7.0',
        localReadError: new Error('cannot read Kramdown')
    });

    try {
        await assert.rejects(
            () => tool.run(ctx, { id: DOC_ID, outDir }),
            (error: unknown) => {
                assert.ok(error instanceof CliError);
                assert.equal(error.errorType, 'CHECKPOINT_PARTIAL_FAILURE');
                const details = error.details as {
                    kernelHistory: { status: string };
                    localRecovery: {
                        status: string;
                        error: { message: string };
                    };
                };
                assert.equal(details.kernelHistory.status, 'created');
                assert.equal(details.localRecovery.status, 'failed');
                assert.equal(
                    details.localRecovery.error.message,
                    'cannot read Kramdown'
                );
                return true;
            }
        );
        assert.equal(
            calls.filter((call) => call.id === 'history.createDocHistory')
                .length,
            1
        );
    } finally {
        rmSync(outDir, { recursive: true, force: true });
    }
});

test('checkpoint-doc preserves kernel history status when local package writing fails', async () => {
    const tempDir = mkdtempSync(
        join(tmpdir(), 'siyuan-checkpoint-local-fail-')
    );
    const invalidOutDir = join(tempDir, 'not-a-directory');
    writeFileSync(invalidOutDir, 'file', 'utf8');
    const { ctx, calls } = makeContext({ version: '3.7.0' });

    try {
        await assert.rejects(
            () => tool.run(ctx, { id: DOC_ID, outDir: invalidOutDir }),
            (error: unknown) => {
                assert.ok(error instanceof CliError);
                assert.equal(error.errorType, 'CHECKPOINT_PARTIAL_FAILURE');
                const details = error.details as {
                    kernelHistory: { status: string };
                    localRecovery: { status: string; dir: string };
                };
                assert.equal(details.kernelHistory.status, 'created');
                assert.equal(details.localRecovery.status, 'failed');
                assert.match(details.localRecovery.dir, /not-a-directory/);
                return true;
            }
        );
        assert.equal(
            calls.filter((call) => call.id === 'history.createDocHistory')
                .length,
            1
        );
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function withTempConfigDir(fn: (dir: string) => void | Promise<void>) {
    const dir = mkdtempSync(join(tmpdir(), 'siyuan-approval-runtime-'));
    process.env['SIYUAN_CLI_CONFIG'] = join(dir, 'config.yaml');
    return Promise.resolve(fn(dir)).finally(() => {
        delete process.env['SIYUAN_CLI_CONFIG'];
        rmSync(dir, { recursive: true, force: true });
    });
}

test('runtime cleans stale broker pid/port state', async () => {
    await withTempConfigDir(async () => {
        const paths = await import('../src/approval/broker-paths.ts');
        const runtime = await import('../src/approval/runtime.ts');
        paths.ensureApprovalStateDirs();
        writeFileSync(paths.getApprovalBrokerPidFile(), '999999', 'utf-8');
        writeFileSync(paths.getApprovalBrokerPortFile(), '4312', 'utf-8');
        writeFileSync(paths.getApprovalBrokerTokenFile(), 'secret', 'utf-8');

        runtime.cleanupStaleApprovalBrokerState();

        assert.equal(paths.readBrokerPid(), null);
        assert.equal(paths.readBrokerPort(), null);
        assert.equal(paths.readBrokerToken(), null);
    });
});


test('runtime startup lock can be acquired and released', async () => {
    await withTempConfigDir(async () => {
        const runtime = await import('../src/approval/runtime.ts');
        const release = await runtime.acquireBrokerStartLock(500);
        const secondAttempt = runtime.acquireBrokerStartLock(100);
        await assert.rejects(secondAttempt, /startup lock/);
        release();
        const releaseAgain = await runtime.acquireBrokerStartLock(500);
        releaseAgain();
    });
});

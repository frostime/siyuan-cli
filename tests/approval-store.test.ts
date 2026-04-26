import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function withTempConfigDir(fn: () => void | Promise<void>) {
    const dir = mkdtempSync(join(tmpdir(), 'siyuan-approval-test-'));
    process.env['SIYUAN_CLI_CONFIG'] = join(dir, 'config.yaml');
    return Promise.resolve(fn()).finally(() => {
        delete process.env['SIYUAN_CLI_CONFIG'];
        rmSync(dir, { recursive: true, force: true });
    });
}

test('approval store creates, lists, decides, and expires requests', async () => {
    await withTempConfigDir(async () => {
        const store = await import('../src/approval/store.ts');

        const pending = store.createApprovalRequest({
            workspaceName: 'main',
            endpointId: 'block.deleteBlock',
            endpointPath: '/api/block/deleteBlock',
            risk: 'destructive',
            summary: 'Delete block',
            payloadPreview: { id: 'x' },
            payloadDigest: 'sha256:abc',
            resourceSummary: ['id: x'],
            timeoutSec: 60
        });

        assert.equal(store.listPendingApprovalRequests().length, 1);
        assert.equal(store.countPendingApprovalRequests(), 1);

        const approved = store.decideApprovalRequest(
            pending.id,
            'approved',
            'human-cli'
        );
        assert.equal(approved?.status, 'approved');
        assert.equal(store.countPendingApprovalRequests(), 0);

        const expired = store.createApprovalRequest(
            {
                workspaceName: 'main',
                endpointId: 'block.updateBlock',
                endpointPath: '/api/block/updateBlock',
                risk: 'elevated',
                summary: 'Update block',
                payloadPreview: { id: 'y' },
                payloadDigest: 'sha256:def',
                resourceSummary: ['id: y'],
                timeoutSec: 1
            },
            new Date('2026-01-01T00:00:00.000Z')
        );

        const timedOut = store.expireTimedOutApprovalRequests(
            '2026-01-01T00:00:02.000Z'
        );
        assert.deepEqual(timedOut.map((item) => item.id), [expired.id]);
        assert.equal(store.readApprovalRequest(expired.id)?.status, 'timed_out');
    });
});

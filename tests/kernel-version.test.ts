import test from 'node:test';
import assert from 'node:assert/strict';

import { executeEndpoint } from '../src/api/guard.ts';
import { EndpointRegistry } from '../src/api/registry.ts';
import { schema as createDocHistory } from '../src/api/endpoints/history/createDocHistory.ts';
import { schema as systemVersion } from '../src/api/endpoints/system/version.ts';
import { buildEndpointHelp, parsePayload } from '../src/shared/argv.ts';
import { CliError } from '../src/shared/errors.ts';
import {
    compareKernelVersions,
    extractKernelVersion
} from '../src/shared/kernel-version.ts';
import {
    PermissionEngine,
    EndpointDeniedError,
    cascadePermission
} from '../src/shared/permission.ts';
import { deriveEndpointId } from '../src/shared/schema.ts';
import type { AppConfig, PermissionConfig } from '../src/workspace/config.ts';

const DOC_ID = '20241016135347-zlrn2cz';

function makeConfig(permission?: PermissionConfig): AppConfig {
    return {
        schemaVersion: 1,
        current: 'local',
        workspaces: {
            local: {
                baseUrl: 'http://127.0.0.1:6806',
                ...(permission ? { permission } : {})
            }
        }
    };
}

function registerHistoryEndpoint() {
    const registry = new EndpointRegistry();
    registry.register(createDocHistory);
    return registry.get(deriveEndpointId(createDocHistory.endpoint).id)!;
}

function makeExecution(version: unknown, permission?: PermissionConfig) {
    const calls: string[] = [];
    const client = {
        async call(endpoint: string) {
            calls.push(endpoint);
            if (endpoint === '/api/query/sql') {
                return [{ id: DOC_ID, box: 'notebook', path: `/${DOC_ID}.sy` }];
            }
            if (endpoint === '/api/system/version') return version;
            if (endpoint === '/api/history/createDocHistory') return null;
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        },
        async upload() {
            throw new Error('Unexpected upload');
        }
    } as any;
    const config = makeConfig(permission);
    const { rules, defaultEffect } = cascadePermission(config, 'local');
    const engine = new PermissionEngine(rules, defaultEffect, client);
    return { calls, client, config, engine };
}

test('kernel version comparison covers equal, lower, higher, and SiYuan suffix formats', () => {
    assert.equal(
        systemVersion.format?.({ responseData: '3.7.0' } as any),
        '3.7.0'
    );
    assert.equal(compareKernelVersions('3.7.0', '3.7.0'), 0);
    assert.equal(compareKernelVersions('3.6.9', '3.7.0'), -1);
    assert.equal(compareKernelVersions('3.7.1', '3.7.0'), 1);
    assert.equal(compareKernelVersions('v3.7.0-dev1', '3.7.0'), 0);
    assert.equal(extractKernelVersion({ ver: '3.7.0' }), '3.7.0');
    assert.equal(extractKernelVersion('3.7.0'), '3.7.0');
});

test('history.createDocHistory declares its write guard and minimum kernel version', () => {
    const entry = registerHistoryEndpoint();
    assert.equal(createDocHistory.minKernelVersion, '3.7.0');
    assert.deepEqual(entry.meta.classification, {
        action: 'write',
        domain: 'content',
        cardinality: 'single'
    });
    assert.deepEqual(createDocHistory.guard?.payloadTargets, [
        { path: 'id', kind: 'id', access: 'write' }
    ]);
    assert.match(buildEndpointHelp(entry), /Requires SiYuan kernel >=3\.7\.0/);
});

test('history.createDocHistory payload requires a valid document id', () => {
    assert.throws(
        () => parsePayload({ schema: createDocHistory, args: {} }),
        (error: unknown) =>
            error instanceof CliError && error.errorType === 'PAYLOAD_INVALID'
    );
    assert.throws(
        () =>
            parsePayload({
                schema: createDocHistory,
                args: { id: 'not-an-id' }
            }),
        (error: unknown) =>
            error instanceof CliError && error.errorType === 'PAYLOAD_INVALID'
    );
});

test('minimum kernel gate rejects old kernels before the history request', async () => {
    const execution = makeExecution('3.6.9');

    await assert.rejects(
        () =>
            executeEndpoint({
                entry: registerHistoryEndpoint(),
                payload: { id: DOC_ID },
                client: execution.client,
                engine: execution.engine,
                config: execution.config
            }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.errorType, 'UNSUPPORTED_KERNEL_VERSION');
            assert.deepEqual(error.details, {
                endpoint: '/api/history/createDocHistory',
                currentKernelVersion: '3.6.9',
                requiredKernelVersion: '3.7.0'
            });
            return true;
        }
    );
    assert.equal(
        execution.calls.includes('/api/history/createDocHistory'),
        false
    );
});

test('minimum kernel gate reports malformed kernel version responses structurally', async () => {
    const execution = makeExecution({ unexpected: true });

    await assert.rejects(
        () =>
            executeEndpoint({
                entry: registerHistoryEndpoint(),
                payload: { id: DOC_ID },
                client: execution.client,
                engine: execution.engine,
                config: execution.config
            }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.errorType, 'KERNEL_VERSION_UNRECOGNIZED');
            assert.deepEqual(error.details, {
                requiredKernelVersion: '3.7.0',
                responseData: { unexpected: true }
            });
            return true;
        }
    );
    assert.equal(
        execution.calls.includes('/api/history/createDocHistory'),
        false
    );
});

test('minimum kernel gate allows equal and higher versions', async () => {
    for (const version of ['3.7.0', '3.8.0']) {
        const execution = makeExecution(version);
        await executeEndpoint({
            entry: registerHistoryEndpoint(),
            payload: { id: DOC_ID },
            client: execution.client,
            engine: execution.engine,
            config: execution.config
        });
        assert.equal(
            execution.calls.filter(
                (endpoint) => endpoint === '/api/history/createDocHistory'
            ).length,
            1
        );
    }
});

test('history endpoint permission denial and dry-run stop before version or target writes', async () => {
    const denied = makeExecution('3.7.0', {
        rules: [{ endpoint: 'history.createDocHistory', effect: 'deny' }]
    });
    await assert.rejects(
        () =>
            executeEndpoint({
                entry: registerHistoryEndpoint(),
                payload: { id: DOC_ID },
                client: denied.client,
                engine: denied.engine,
                config: denied.config
            }),
        EndpointDeniedError
    );
    assert.deepEqual(denied.calls, []);

    const dryRun = makeExecution('3.7.0', {
        rules: [{ endpoint: 'history.createDocHistory', effect: 'approval' }]
    });
    const result = await executeEndpoint({
        entry: registerHistoryEndpoint(),
        payload: { id: DOC_ID },
        client: dryRun.client,
        engine: dryRun.engine,
        config: dryRun.config,
        dryRun: true
    });
    assert.deepEqual(result, {
        dryRun: true,
        endpoint: '/api/history/createDocHistory',
        payload: { id: DOC_ID },
        wouldRequestApproval: true
    });
    assert.deepEqual(dryRun.calls, ['/api/query/sql']);
});

test('registry requires exact major.minor.patch authored minimum versions', () => {
    for (const minKernelVersion of ['3.7', 'v3.7.0', '3.7.0-dev1', '3.7.0-']) {
        const registry = new EndpointRegistry();
        assert.throws(
            () =>
                registry.register({
                    ...createDocHistory,
                    endpoint: '/api/history/invalidVersion',
                    minKernelVersion
                }),
            /minKernelVersion must use major\.minor\.patch/
        );
    }
});

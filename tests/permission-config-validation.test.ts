import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '../src/workspace/config.ts';
import { loadProjectConfig, type ProjectConfigLocation } from '../src/workspace/project-config.ts';
import { CliError } from '../src/shared/errors.ts';

function tempDir(): string {
    return mkdtempSync(join(tmpdir(), 'siyuan-cli-permission-config-'));
}

test('global config rejects unknown permission rule fields', () => {
    const dir = tempDir();
    try {
        const configPath = join(dir, 'config.yaml');
        writeFileSync(
            configPath,
            `schemaVersion: 1
current: dev
workspaces:
  dev:
    baseUrl: http://127.0.0.1:6806
    permission:
      rules:
        - risk: high
          effect: approval
`,
            'utf-8'
        );
        assert.throws(() => loadConfig(configPath), (error) => {
            assert.equal((error as CliError).errorType, 'CONFIG_PARSE_ERROR');
            assert.match((error as Error).message, /unknown field "risk"/);
            return true;
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('project config rejects unknown permission rule fields', () => {
    const dir = tempDir();
    try {
        const projectPath = join(dir, '.siyuan-cli.yaml');
        writeFileSync(
            projectPath,
            `schemaVersion: 1
workspace: dev
permission:
  rules:
    - severity: high
      effect: approval
`,
            'utf-8'
        );
        const location: ProjectConfigLocation = { path: projectPath, directory: dir };
        assert.throws(
            () =>
                loadProjectConfig(location, {
                    schemaVersion: 1,
                    current: 'dev',
                    workspaces: { dev: { baseUrl: 'http://127.0.0.1:6806' } }
                }),
            (error) => {
                assert.equal((error as CliError).errorType, 'PROJECT_CONFIG_PARSE_ERROR');
                assert.match((error as Error).message, /unknown field "severity"/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

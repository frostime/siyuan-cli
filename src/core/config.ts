/**
 * Config file management for siyuan-cli.
 * Format: ~/.config/siyuan-cli/config.yaml
 */
import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    existsSync,
    chmodSync,
    copyFileSync,
    unlinkSync
} from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'pathe';
import { parse, stringify } from 'yaml';
import { getConfigPath } from '../utils/paths.js';
import { CliError, ExitCode } from '../utils/errors.js';
import type { EndpointMode, EndpointScope, EndpointSurface } from './schema.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotebookID = string;
export type BlockID = string;
export type BlockPath = string; // SiYuan path (ID-based path of containing document)
export type WorkspacePath = string;

export interface ContentScopeRule {
    notebooks?: { deny?: NotebookID[]; allow?: NotebookID[] };
    paths?: { deny?: BlockPath[]; allow?: BlockPath[] };
}

export interface WorkspaceScopeRule {
    paths?: { deny?: WorkspacePath[]; allow?: WorkspacePath[] };
}

export interface ConfirmPolicy {
    modes?: EndpointMode[];
    surfaces?: EndpointSurface[];
    scopes?: EndpointScope[];
}

export interface PermissionConfig {
    endpoints?: { deny?: string[]; allow?: string[] };
    tools?: { deny?: string[]; allow?: string[] };
    content?: {
        read?: ContentScopeRule;
        write?: ContentScopeRule;
    };
    workspace?: {
        read?: WorkspaceScopeRule;
        write?: WorkspaceScopeRule;
    };
    confirm?: ConfirmPolicy;
}

export interface TokenSource {
    type: 'env' | 'file' | 'command';
    value: string;
}

export interface WorkspaceEntry {
    baseUrl: string;
    token?: string;
    tokenSource?: TokenSource;
    permission?: PermissionConfig;
}

export interface AppConfig {
    schemaVersion: number;
    current: string;
    workspaces: Record<string, WorkspaceEntry>;
    defaults?: {
        permission?: PermissionConfig;
    };
}

export interface ResolvedWorkspace extends WorkspaceEntry {
    name: string;
    token?: string;
}

const SCHEMA_VERSION = 2;

function defaultConfig(): AppConfig {
    return {
        schemaVersion: SCHEMA_VERSION,
        current: '',
        workspaces: {}
    };
}

function migrateLegacyWindowsConfig(targetPath: string): void {
    const appdata = process.env['APPDATA'];
    if (!appdata) return;
    const legacyPath = join(appdata, 'siyuan-cli', 'config.yaml');
    if (legacyPath === targetPath) return;
    if (!existsSync(legacyPath) || existsSync(targetPath)) return;

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(legacyPath, targetPath);
    process.stderr.write(
        JSON.stringify({
            notice: 'CONFIG_MIGRATED',
            from: legacyPath,
            to: targetPath
        }) + '\n'
    );
    try {
        unlinkSync(legacyPath);
    } catch {
        // keep legacy copy if deletion fails
    }
}

export function loadConfig(configPath?: string): AppConfig {
    const path = configPath ?? getConfigPath();
    migrateLegacyWindowsConfig(path);

    if (!existsSync(path)) return defaultConfig();

    try {
        const raw = readFileSync(path, 'utf-8');
        const parsed = parse(raw) as Partial<AppConfig>;
        const schemaVersion = parsed.schemaVersion ?? 1;
        if (schemaVersion !== SCHEMA_VERSION) {
            throw new CliError(
                ExitCode.CONFIG,
                'CONFIG_VERSION_UNSUPPORTED',
                `Config schemaVersion ${schemaVersion} is unsupported. Expected ${SCHEMA_VERSION}.`,
                'Delete the old config file and recreate workspaces in alpha stage.'
            );
        }
        return {
            schemaVersion: SCHEMA_VERSION,
            current: parsed.current ?? '',
            workspaces: parsed.workspaces ?? {},
            ...(parsed.defaults ? { defaults: parsed.defaults } : {})
        };
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError(
            ExitCode.CONFIG,
            'CONFIG_PARSE_ERROR',
            `Failed to parse config at ${path}: ${e instanceof Error ? e.message : String(e)}`,
            'Delete the config file and recreate it in alpha stage.'
        );
    }
}

export function saveConfig(config: AppConfig, configPath?: string): void {
    const path = configPath ?? getConfigPath();
    migrateLegacyWindowsConfig(path);
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        path,
        stringify({ ...config, schemaVersion: SCHEMA_VERSION }),
        'utf-8'
    );
    try {
        chmodSync(path, 0o600);
    } catch {
        // Windows — silently ignore
    }
}

export interface WorkspaceOverrides {
    workspace?: string;
    baseUrl?: string;
    token?: string;
}

function resolveTokenSource(source?: TokenSource): string | undefined {
    if (!source) return undefined;
    if (source.type === 'env') return process.env[source.value];
    if (source.type === 'file')
        return readFileSync(source.value, 'utf-8').split(/\r?\n/, 1)[0]?.trim();
    if (source.type === 'command')
        return execSync(source.value, { encoding: 'utf-8' }).trim();
    return undefined;
}

export function resolveWorkspace(
    config: AppConfig,
    overrides: WorkspaceOverrides = {}
): ResolvedWorkspace {
    if (overrides.baseUrl) {
        return {
            name: '<ad-hoc>',
            baseUrl: overrides.baseUrl,
            ...(overrides.token ? { token: overrides.token } : {})
        };
    }

    const name =
        overrides.workspace ??
        process.env['SIYUAN_CLI_WORKSPACE'] ??
        config.current;
    if (!name) {
        throw new CliError(
            ExitCode.CONFIG,
            'NO_WORKSPACE',
            'No active workspace. Run `siyuan workspace add <name> --url <url>` first.',
            'Or pass --workspace <name> to specify one explicitly.'
        );
    }

    const entry = config.workspaces[name];
    if (!entry) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_NOT_FOUND',
            `Workspace "${name}" not found in config.`,
            'Run `siyuan workspace list` to see available workspaces.'
        );
    }

    const token =
        overrides.token ??
        process.env['SIYUAN_CLI_TOKEN'] ??
        resolveTokenSource(entry.tokenSource) ??
        entry.token;
    return {
        name,
        baseUrl: entry.baseUrl,
        ...(token ? { token } : {}),
        ...(entry.tokenSource ? { tokenSource: entry.tokenSource } : {}),
        ...(entry.permission ? { permission: entry.permission } : {})
    };
}

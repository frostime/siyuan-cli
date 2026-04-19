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
import {
    findProjectConfig,
    loadProjectConfig
} from '../utils/project-config.js';
import { CliError, ExitCode } from '../utils/errors.js';
import type { PermissionConfig } from './schema.js';
export type { PermissionConfig };

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotebookID = string;
export type BlockID = string;
export type BlockPath = string; // SiYuan path (ID-based path of containing document)
export type WorkspacePath = string;

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

/**
 * How the active workspace name was determined. Threaded through to guard layer
 * so IMPLICIT_WORKSPACE warnings can fire on writes using the low-priority fallback.
 */
export type WorkspaceResolutionSource =
    | 'flag' // --workspace CLI flag
    | 'env' // $SIYUAN_CLI_WORKSPACE
    | 'project-file' // .siyuan-cli.yaml discovered by walking up from cwd
    | 'global-current' // fallback to config.current
    | 'ad-hoc'; // --baseUrl path, no workspace name involved

export interface ResolvedWorkspace extends WorkspaceEntry {
    name: string;
    token?: string;
    /** How this workspace name was chosen. */
    source: WorkspaceResolutionSource;
    /** Absolute path of the project config that contributed to this resolution, if any. */
    projectConfigPath?: string;
    /**
     * Permission declared in .siyuan-cli.yaml. When present, it *completely replaces*
     * workspaces[name].permission / defaults.permission for this invocation.
     * Independent of how `name` was resolved.
     */
    effectivePermission?: PermissionConfig;
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

const ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/;
const ID_SEGMENT_RE = /\d{14}-[0-9a-z]{7}/;

/** Soft warning helper — never throws, just writes to stderr. */
function warnRulesSmoke(
    scope: string,
    permission: PermissionConfig | undefined
): void {
    if (!permission?.rules) return;
    for (const [i, rule] of permission.rules.entries()) {
        if (rule.notebook && !ID_PATTERN.test(rule.notebook)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'LIKELY_HPATH_NOT_ID',
                    scope,
                    at: `rules[${i}].notebook`,
                    value: rule.notebook,
                    hint: 'Notebook rules take a notebook id, not an hpath.'
                }) + '\n'
            );
        }
        if (rule.path && !ID_SEGMENT_RE.test(rule.path)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'LIKELY_HPATH_NOT_ID_IN_PATH',
                    scope,
                    at: `rules[${i}].path`,
                    value: rule.path,
                    hint: 'Path rules take an id-based SiYuan path, not an hpath.'
                }) + '\n'
                );
        }
    }
}

function runConfigSmokeTest(config: AppConfig): void {
    warnRulesSmoke('defaults', config.defaults?.permission);
    for (const [name, ws] of Object.entries(config.workspaces)) {
        warnRulesSmoke(`workspaces.${name}`, ws.permission);
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
        const result: AppConfig = {
            schemaVersion: SCHEMA_VERSION,
            current: parsed.current ?? '',
            workspaces: parsed.workspaces ?? {},
            ...(parsed.defaults ? { defaults: parsed.defaults } : {})
        };
        runConfigSmokeTest(result);
        return result;
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

/**
 * Resolve the effective workspace for a business invocation (api/tool).
 * Extends resolveWorkspace() with:
 *   - .siyuan-cli.yaml discovery (walks up from `cwd`)
 *   - project-file workspace name (priority between env and global-current)
 *   - project-file permission override (attached as effectivePermission)
 *
 * Workspace-management commands (add/list/use/remove/verify/show) should keep
 * using resolveWorkspace() directly — they operate on the global config and
 * should not be perturbed by the current directory.
 */
export function resolveEffectiveWorkspace(
    config: AppConfig,
    overrides: WorkspaceOverrides = {},
    cwd: string = process.cwd()
): ResolvedWorkspace {
    // ad-hoc mode short-circuits everything. No project file, no permission.
    if (overrides.baseUrl) {
        return resolveWorkspace(config, overrides);
    }

    const location = findProjectConfig(cwd);
    const projectConfig = location ? loadProjectConfig(location, config) : null;

    // Stitch project-file workspace into the cascade between env and global-current.
    // resolveWorkspace() does not know about project files, so we pre-fill overrides
    // only when the higher-priority sources (flag/env) did not already win.
    const effectiveOverrides: WorkspaceOverrides = { ...overrides };
    let sourceHintFromProject = false;
    if (
        !effectiveOverrides.workspace &&
        !process.env['SIYUAN_CLI_WORKSPACE'] &&
        projectConfig?.workspace
    ) {
        effectiveOverrides.workspace = projectConfig.workspace;
        sourceHintFromProject = true;
    }

    const base = resolveWorkspace(config, effectiveOverrides);

    // If the workspace name came from the project file, rewrite source accordingly.
    // resolveWorkspace() reported 'flag' because we pre-filled overrides.workspace;
    // here we correct it back to 'project-file' for accurate provenance.
    const source: WorkspaceResolutionSource = sourceHintFromProject
        ? 'project-file'
        : base.source;

    // Project permission is independent of how the workspace name was chosen.
    // This is the intentional decision: a project config expresses "in this dir,
    // operate under these rules" — valid even when --workspace flips the target.
    return {
        ...base,
        source,
        ...(projectConfig?.permission
            ? { effectivePermission: projectConfig.permission }
            : {}),
        ...(location ? { projectConfigPath: location.path } : {})
    };
}

export function resolveWorkspace(
    config: AppConfig,
    overrides: WorkspaceOverrides = {}
): ResolvedWorkspace {
    if (overrides.baseUrl) {
        return {
            name: '<ad-hoc>',
            baseUrl: overrides.baseUrl,
            source: 'ad-hoc',
            ...(overrides.token ? { token: overrides.token } : {})
        };
    }

    let name: string | undefined;
    let source: WorkspaceResolutionSource;
    if (overrides.workspace) {
        name = overrides.workspace;
        source = 'flag';
    } else if (process.env['SIYUAN_CLI_WORKSPACE']) {
        name = process.env['SIYUAN_CLI_WORKSPACE'];
        source = 'env';
    } else if (config.current) {
        name = config.current;
        source = 'global-current';
    } else {
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
        source,
        ...(token ? { token } : {}),
        ...(entry.tokenSource ? { tokenSource: entry.tokenSource } : {}),
        ...(entry.permission ? { permission: entry.permission } : {})
    };
}

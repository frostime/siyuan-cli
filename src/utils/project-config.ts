/**
 * Project-level config (.siyuan-cli.yaml) discovery, loading, and validation.
 *
 * Resolution model: walk upward from cwd until we find a .siyuan-cli.yaml,
 * stopping at $HOME (not inclusive), the filesystem root, or MAX_WALK_DEPTH.
 * The user's home ~/.siyuan-cli.yaml is *never* read to avoid colliding
 * semantically with the global XDG config.
 *
 * Hard errors:
 *   - PROJECT_CONFIG_PARSE_ERROR           (YAML unreadable/invalid)
 *   - PROJECT_CONFIG_VERSION_UNSUPPORTED   (schemaVersion != current)
 *   - PROJECT_CONFIG_REJECTED_FIELD        (token/baseUrl/tokenSource/defaults present)
 *   - PROJECT_CONFIG_WORKSPACE_NOT_FOUND   (workspace name not in AppConfig)
 *
 * Soft warnings:
 *   - UNKNOWN_PROJECT_CONFIG_KEY           (top-level key not recognized)
 *   - LIKELY_HPATH_NOT_ID / LIKELY_HPATH_NOT_ID_IN_PATH (same smoke-test as global)
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { parse } from 'yaml';
import { CliError, ExitCode } from './errors.js';
import type { AppConfig, PermissionConfig } from '../core/config.js';

export const PROJECT_CONFIG_FILENAME = '.siyuan-cli.yaml';
export const PROJECT_SCHEMA_VERSION = 1;
const MAX_WALK_DEPTH = 32;

const REJECTED_FIELDS = ['token', 'baseUrl', 'tokenSource', 'defaults'] as const;
const ALLOWED_TOP_LEVEL = new Set([
    'schemaVersion',
    'workspace',
    'permission'
]);
const ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/;
const ID_SEGMENT_RE = /\d{14}-[0-9a-z]{7}/;

export interface ProjectConfig {
    schemaVersion: number;
    workspace?: string;
    permission?: PermissionConfig;
}

export interface ProjectConfigLocation {
    /** Absolute path to the .siyuan-cli.yaml */
    path: string;
    /** Directory that contains the file */
    directory: string;
}

/**
 * Walk from startDir upward looking for .siyuan-cli.yaml.
 * Returns null if nothing is found before one of:
 *   - the directory equals $HOME (we stop before reading $HOME/.siyuan-cli.yaml)
 *   - the filesystem root is reached
 *   - MAX_WALK_DEPTH iterations elapse
 */
export function findProjectConfig(
    startDir: string
): ProjectConfigLocation | null {
    const home = resolve(homedir());
    let current = resolve(startDir);
    for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
        // Never read $HOME/.siyuan-cli.yaml — that would collide with the XDG config
        if (current === home) return null;
        const candidate = join(current, PROJECT_CONFIG_FILENAME);
        if (existsSync(candidate)) {
            return { path: candidate, directory: current };
        }
        const parent = dirname(current);
        if (parent === current) return null; // filesystem root
        current = parent;
    }
    return null;
}

function warnProjectPermissionSmoke(
    location: ProjectConfigLocation,
    permission: PermissionConfig | undefined
): void {
    if (!permission?.content) return;
    const scope = `project(${location.path})`;
    for (const access of ['read', 'write'] as const) {
        const rule = permission.content[access];
        if (!rule) continue;
        for (const bucket of ['allow', 'deny'] as const) {
            for (const nb of rule.notebooks?.[bucket] ?? []) {
                if (!ID_PATTERN.test(nb)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID',
                            scope,
                            at: `permission.content.${access}.notebooks.${bucket}`,
                            value: nb
                        }) + '\n'
                    );
                }
            }
            for (const p of rule.paths?.[bucket] ?? []) {
                if (!ID_SEGMENT_RE.test(p)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID_IN_PATH',
                            scope,
                            at: `permission.content.${access}.paths.${bucket}`,
                            value: p
                        }) + '\n'
                    );
                }
            }
        }
    }
}

/**
 * Load and validate a project config file. Throws on hard errors.
 * Writes soft warnings to stderr for suspicious-but-not-fatal content.
 *
 * `appConfig` is passed in so we can verify that `workspace: <name>` refers
 * to a known workspace — this check runs at load time, Request §validation #1.
 */
export function loadProjectConfig(
    location: ProjectConfigLocation,
    appConfig: AppConfig
): ProjectConfig {
    let raw: string;
    try {
        raw = readFileSync(location.path, 'utf-8');
    } catch (e) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_PARSE_ERROR',
            `Cannot read project config at ${location.path}: ${e instanceof Error ? e.message : String(e)}`
        );
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = (parse(raw) as Record<string, unknown>) ?? {};
    } catch (e) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_PARSE_ERROR',
            `Invalid YAML in project config at ${location.path}: ${e instanceof Error ? e.message : String(e)}`,
            'Fix the YAML syntax or remove the file to fall back to global config.'
        );
    }

    // Rejected fields: project files are safe to commit precisely because they
    // cannot hold credentials or connection overrides.
    for (const field of REJECTED_FIELDS) {
        if (field in parsed) {
            throw new CliError(
                ExitCode.CONFIG,
                'PROJECT_CONFIG_REJECTED_FIELD',
                `Field "${field}" is not allowed in ${PROJECT_CONFIG_FILENAME} (${location.path}).`,
                'Connection details belong in the global config only. Remove this field.'
            );
        }
    }

    // Unknown top-level keys: soft warning (forward compatibility)
    for (const key of Object.keys(parsed)) {
        if (!ALLOWED_TOP_LEVEL.has(key)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'UNKNOWN_PROJECT_CONFIG_KEY',
                    at: location.path,
                    key
                }) + '\n'
            );
        }
    }

    // schemaVersion: hard error on BOTH missing and mismatched.
    // Docs declare schemaVersion as required; a silent default of 1 would
    // muddy future migrations — when v2 ships, an unversioned file left on
    // disk must not be ambiguously interpreted as "opted into v1".
    const rawSchemaVersion = parsed['schemaVersion'];
    if (rawSchemaVersion === undefined) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_VERSION_UNSUPPORTED',
            `Project config at ${location.path} is missing required field "schemaVersion". Add \`schemaVersion: ${PROJECT_SCHEMA_VERSION}\` at the top of the file.`
        );
    }
    if (rawSchemaVersion !== PROJECT_SCHEMA_VERSION) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_VERSION_UNSUPPORTED',
            `Project config schemaVersion ${String(rawSchemaVersion)} at ${location.path} is unsupported. Expected ${PROJECT_SCHEMA_VERSION}.`
        );
    }

    const workspace = parsed['workspace'];
    if (workspace !== undefined && typeof workspace !== 'string') {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_PARSE_ERROR',
            `Field "workspace" in ${location.path} must be a string.`
        );
    }
    if (workspace && !appConfig.workspaces[workspace]) {
        throw new CliError(
            ExitCode.CONFIG,
            'PROJECT_CONFIG_WORKSPACE_NOT_FOUND',
            `Project config at ${location.path} references workspace "${workspace}" which is not defined in the global config.`,
            `Run \`siyuan workspace add ${workspace} --url <url>\` to register it.`
        );
    }

    const permission = parsed['permission'] as PermissionConfig | undefined;

    const result: ProjectConfig = {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        ...(workspace ? { workspace } : {}),
        ...(permission ? { permission } : {})
    };

    warnProjectPermissionSmoke(location, permission);

    return result;
}

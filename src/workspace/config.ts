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
import { dirname, join } from 'pathe';
import { parse, stringify } from 'yaml';
import { getConfigPath } from './paths.js';
import { CliError, ExitCode } from '../shared/errors.js';
import {
    resolvePermissionEffect,
    validateBehaviorRaw,
    type BehaviorConfig,
    type PermissionConfig,
    type RawApiBehaviorConfig,
    type ResolvedBehaviorConfig,
    type ResolvedRawApiBehaviorConfig
} from '../shared/schema.js';
export type { BehaviorConfig, PermissionConfig, ResolvedBehaviorConfig };

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
    baseUrl?: string;
    workspaceDir?: string;
    token?: string;
    tokenSource?: TokenSource;
    permission?: PermissionConfig;
    behavior?: BehaviorConfig;
}

export interface AppConfig {
    schemaVersion: number;
    current: string;
    workspaces: Record<string, WorkspaceEntry>;
    defaults?: {
        permission?: PermissionConfig;
        behavior?: BehaviorConfig;
    };
}



const SCHEMA_VERSION = 1;

const BUILT_IN_BEHAVIOR: ResolvedBehaviorConfig = {
    allowYes: true,
    approval: { timeout: 60, autoOpen: true, openDebounceMs: 1000 },
    rawApi: { enabled: false, allow: [] }
};

/**
 * Resolve effective behavior by merging Project > Workspace > Defaults > Built-in.
 * All three inputs are optional; missing fields fall through to the next source.
 */
function resolveEffectiveRawApiBehavior(
    defaults: RawApiBehaviorConfig | undefined,
    workspace: RawApiBehaviorConfig | undefined,
    project: RawApiBehaviorConfig | undefined
): ResolvedRawApiBehaviorConfig {
    const rawApi = project ?? workspace ?? defaults;
    return {
        enabled: rawApi?.enabled ?? BUILT_IN_BEHAVIOR.rawApi.enabled,
        allow: rawApi?.allow ?? BUILT_IN_BEHAVIOR.rawApi.allow
    };
}

export function resolveEffectiveBehavior(
    defaults: BehaviorConfig | undefined,
    workspace: BehaviorConfig | undefined,
    project: BehaviorConfig | undefined
): ResolvedBehaviorConfig {
    return {
        allowYes:
            project?.allowYes ??
            workspace?.allowYes ??
            defaults?.allowYes ??
            BUILT_IN_BEHAVIOR.allowYes,
        approval: {
            timeout:
                project?.approval?.timeout ??
                workspace?.approval?.timeout ??
                defaults?.approval?.timeout ??
                BUILT_IN_BEHAVIOR.approval.timeout,
            autoOpen:
                project?.approval?.autoOpen ??
                workspace?.approval?.autoOpen ??
                defaults?.approval?.autoOpen ??
                BUILT_IN_BEHAVIOR.approval.autoOpen,
            openDebounceMs:
                project?.approval?.openDebounceMs ??
                workspace?.approval?.openDebounceMs ??
                defaults?.approval?.openDebounceMs ??
                BUILT_IN_BEHAVIOR.approval.openDebounceMs
        },
        rawApi: resolveEffectiveRawApiBehavior(
            defaults?.rawApi,
            workspace?.rawApi,
            project?.rawApi
        )
    };
}

function defaultConfig(): AppConfig {
    return {
        schemaVersion: SCHEMA_VERSION,
        current: '',
        workspaces: {},
        defaults: {
            permission: {
                default: 'allow',
                rules: []
            }
        }
    };
}

function normalizePermission(permission?: PermissionConfig): PermissionConfig {
    return {
        default: resolvePermissionEffect(permission?.default ?? 'allow'),
        rules: (permission?.rules ?? []).map((rule) => {
            if (rule.root_id) {
                return {
                    ...rule,
                    path: `**/${rule.root_id}.sy`,
                    effect: resolvePermissionEffect(rule.effect)
                };
            }
            return {
                ...rule,
                effect: resolvePermissionEffect(rule.effect)
            };
        })
    };
}

function normalizeRawApiBehavior(rawApi?: RawApiBehaviorConfig): RawApiBehaviorConfig | undefined {
    if (!rawApi) return undefined;
    return {
        ...(rawApi.enabled !== undefined ? { enabled: rawApi.enabled } : {}),
        ...(rawApi.allow !== undefined ? { allow: rawApi.allow } : {})
    };
}

function normalizeBehavior(behavior?: BehaviorConfig): BehaviorConfig | undefined {
    if (!behavior) return undefined;
    return {
        ...(behavior.allowYes !== undefined ? { allowYes: behavior.allowYes } : {}),
        ...(behavior.approval
            ? {
                  approval: {
                      ...(behavior.approval.timeout !== undefined
                          ? { timeout: behavior.approval.timeout }
                          : {}),
                      ...(behavior.approval.autoOpen !== undefined
                          ? { autoOpen: behavior.approval.autoOpen }
                          : {}),
                      ...(behavior.approval.openDebounceMs !== undefined
                          ? { openDebounceMs: behavior.approval.openDebounceMs }
                          : {})
                  }
              }
            : {}),
        ...(behavior.rawApi
            ? { rawApi: normalizeRawApiBehavior(behavior.rawApi) }
            : {})
    };
}

function normalizeConfig(config: AppConfig): AppConfig {
    const workspaces = Object.fromEntries(
        Object.entries(config.workspaces ?? {}).map(([name, ws]) => [
            name,
            {
                ...(ws.baseUrl ? { baseUrl: ws.baseUrl } : {}),
                ...(ws.workspaceDir ? { workspaceDir: ws.workspaceDir } : {}),
                ...(ws.token ? { token: ws.token } : {}),
                ...(ws.tokenSource ? { tokenSource: ws.tokenSource } : {}),
                permission: normalizePermission(ws.permission),
                ...(ws.behavior ? { behavior: normalizeBehavior(ws.behavior) } : {})
            }
        ])
    );

    return {
        schemaVersion: SCHEMA_VERSION,
        current: config.current ?? '',
        workspaces,
        defaults: {
            permission: normalizePermission(config.defaults?.permission),
            ...(config.defaults?.behavior
                ? { behavior: normalizeBehavior(config.defaults.behavior) }
                : {})
        }
    };
}

function renderConfigYaml(config: AppConfig): string {
    const header = [
        '# siyuan-cli config',
        '#',
        '# Global defaults:',
        '# - permission.default: allow',
        '# - add deny/approval rules to restrict access',
        '# - behavior.allowYes: true (--yes bypasses approval)',
        '# - behavior.approval.timeout: 60 (seconds)',
        '# - behavior.approval.autoOpen: true (open browser on approval)',
        '# - behavior.approval.openDebounceMs: 1000 (suppress repeated browser opens)',
        '# - behavior.rawApi.enabled: false (raw kernel API fallback is opt-in)',
        '# - token and tokenSource are global-only and should stay out of project files',
        ''
    ].join('\n');
    return header + stringify(normalizeConfig(config));
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

function hasLeafIdSegment(pathPattern: string): boolean {
    for (const match of pathPattern.matchAll(/\d{14}-[0-9a-z]{7}/g)) {
        const end = (match.index ?? 0) + match[0].length;
        const next = pathPattern[end];
        if (next !== '/') return true;
    }
    return false;
}

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
        if (rule.root_id && rule.path) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'ROOT_ID_OVERRIDES_PATH',
                    scope,
                    at: `rules[${i}]`,
                    hint: 'root_id takes precedence; explicit path is ignored.'
                }) + '\n'
            );
        }
        if (rule.root_id && !ID_PATTERN.test(rule.root_id)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'LIKELY_HPATH_NOT_ID',
                    scope,
                    at: `rules[${i}].root_id`,
                    value: rule.root_id,
                    hint: 'root_id rules take a document block id.'
                }) + '\n'
            );
        }
        if (rule.path && !rule.root_id) {
            const hasIdSegment = ID_SEGMENT_RE.test(rule.path);
            if (!hasIdSegment) {
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
            if (
                hasIdSegment &&
                !rule.path.includes('.sy') &&
                hasLeafIdSegment(rule.path)
            ) {
                process.stderr.write(
                    JSON.stringify({
                        warning: 'LIKELY_PATH_MISSING_SY_SUFFIX',
                        scope,
                        at: `rules[${i}].path`,
                        value: rule.path,
                        hint: 'Path rules match raw blocks.path values. Document paths usually end with ".sy" (for a doc id, use patterns like "**/<docId>.sy").'
                    }) + '\n'
                );
            }
        }
    }
}

function validateBehavior(
    behavior: unknown,
    scope: string,
    configPath: string
): void {
    const results = validateBehaviorRaw(behavior, scope);
    for (const r of results) {
        if (r.kind === 'error') {
            throw new CliError(ExitCode.CONFIG, 'CONFIG_PARSE_ERROR', `${r.message} (at ${configPath})`);
        }
        process.stderr.write(JSON.stringify({ warning: 'UNKNOWN_BEHAVIOR_KEY', scope, ...(r.kind === 'warning' ? { key: r.key } : {}) }) + '\n');
    }
}

function runConfigSmokeTest(config: AppConfig, configPath: string): void {
    warnRulesSmoke('defaults', config.defaults?.permission);
    validateBehavior(config.defaults?.behavior, 'defaults', configPath);
    for (const [name, ws] of Object.entries(config.workspaces)) {
        warnRulesSmoke(`workspaces.${name}`, ws.permission);
        validateBehavior(ws.behavior, `workspaces.${name}`, configPath);
    }
}

export function loadConfig(configPath?: string): AppConfig {
    const path = configPath ?? getConfigPath();
    migrateLegacyWindowsConfig(path);

    if (!existsSync(path)) return defaultConfig();

    try {
        const raw = readFileSync(path, 'utf-8');
        const parsed = parse(raw) as Partial<AppConfig>;
        const schemaVersion = parsed.schemaVersion;
        if (schemaVersion !== SCHEMA_VERSION) {
            throw new CliError(
                ExitCode.CONFIG,
                'CONFIG_VERSION_UNSUPPORTED',
                `Config schemaVersion ${schemaVersion} is unsupported. Expected ${SCHEMA_VERSION}.`,
                'Delete the old config file and recreate workspaces in alpha stage.'
            );
        }
        // Validate behavior on raw parsed data BEFORE normalization,
        // so invalid shapes are caught before normalizeBehavior() strips them.
        validateBehavior(parsed.defaults?.behavior, 'defaults', path);
        if (parsed.workspaces) {
            for (const [name, ws] of Object.entries(parsed.workspaces)) {
                if (ws && typeof ws === 'object') {
                    const wsRecord = ws as unknown as Record<string, unknown>;
                    validateBehavior(
                        wsRecord['behavior'],
                        `workspaces.${name}`,
                        path
                    );
                }
            }
        }
        const result: AppConfig = normalizeConfig({
            schemaVersion: SCHEMA_VERSION,
            current: parsed.current ?? '',
            workspaces: parsed.workspaces ?? {},
            defaults: parsed.defaults
        });
        runConfigSmokeTest(result, path);
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
    writeFileSync(path, renderConfigYaml(config), 'utf-8');
    try {
        chmodSync(path, 0o600);
    } catch {
        // Windows — silently ignore
    }
}

// Re-export workspace resolution symbols for backward compatibility
export {
    resolveWorkspace,
    resolveEffectiveWorkspace,
    materializeWorkspace,
    type WorkspaceResolutionSource,
    type ResolvedWorkspace,
    type MaterializedWorkspace,
    type WorkspaceOverrides
} from './resolve.js';

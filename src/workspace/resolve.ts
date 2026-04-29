/**
 * Workspace resolution chain for siyuan-cli.
 *
 * Resolves the effective workspace for business invocations (api/tool) by
 * traversing: CLI flag → env var → project file → global config.current → ad-hoc.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
    findProjectConfig,
    loadProjectConfig
} from './project-config.js';
import { CliError, ExitCode } from '../shared/errors.js';
import { resolveWorkspaceDirToBaseUrl } from './resolver.js';
import type {
    AppConfig,
    WorkspaceEntry,
    TokenSource
} from './config.js';

// ─── Types ───────────────────────────────────────────────────────────────────

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
    effectivePermission?: import('./config.js').PermissionConfig;
    /**
     * Behavior declared in .siyuan-cli.yaml. When present, fields are merged
     * with workspace and defaults behavior (field-level, not object-level).
     */
    effectiveBehavior?: import('./config.js').BehaviorConfig;
}

export interface MaterializedWorkspace extends Omit<ResolvedWorkspace, 'baseUrl'> {
    /** Concrete URL ready for SiyuanClient. */
    baseUrl: string;
}

export interface WorkspaceOverrides {
    workspace?: string;
    baseUrl?: string;
    token?: string;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function resolveTokenSource(source?: TokenSource): string | undefined {
    if (!source) return undefined;
    if (source.type === 'env') return process.env[source.value];
    if (source.type === 'file')
        return readFileSync(source.value, 'utf-8').split(/\r?\n/, 1)[0]?.trim();
    if (source.type === 'command')
        return execSync(source.value, { encoding: 'utf-8' }).trim();
    return undefined;
}

// ─── Resolution functions ────────────────────────────────────────────────────

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
        ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
        ...(entry.workspaceDir ? { workspaceDir: entry.workspaceDir } : {}),
        source,
        ...(token ? { token } : {}),
        ...(entry.tokenSource ? { tokenSource: entry.tokenSource } : {}),
        ...(entry.permission ? { permission: entry.permission } : {}),
        ...(entry.behavior ? { behavior: entry.behavior } : {})
    };
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
        ...(projectConfig?.behavior
            ? { effectiveBehavior: projectConfig.behavior }
            : {}),
        ...(location ? { projectConfigPath: location.path } : {})
    };
}

export async function materializeWorkspace(
    workspace: ResolvedWorkspace
): Promise<MaterializedWorkspace> {
    if (workspace.baseUrl) {
        return workspace as MaterializedWorkspace;
    }
    if (!workspace.workspaceDir) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_MISSING_CONNECTION',
            `Workspace "${workspace.name}" has neither baseUrl nor workspaceDir configured. Add one.`,
            'Use `siyuan workspace add` with --url or --workspace-dir.'
        );
    }
    const resolved = await resolveWorkspaceDirToBaseUrl(workspace.workspaceDir);
    return {
        ...workspace,
        baseUrl: resolved.baseUrl
    };
}

/**
 * Workspace resolution chain for siyuan-cli.
 *
 * Resolves the effective workspace for business invocations (api/tool) by
 * traversing: --baseUrl → CLI flag → env var → (project file vs process
 * binding, which must agree) → global config.current.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
    findProjectConfig,
    loadProjectConfig
} from './project-config.js';
import { CliError, ExitCode } from '../shared/errors.js';
import { resolveWorkspaceDirToBaseUrl } from './resolver.js';
import { findActiveBinding } from './process-binding.js';
import type {
    ProcessIdentityStrength,
    ProcessNode,
    ProcessTreeHost
} from './process-tree.js';
import type { AppConfig, WorkspaceEntry, TokenSource } from './config.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkspaceResolutionSource =
    | 'flag' // --workspace CLI flag
    | 'env' // $SIYUAN_CLI_WORKSPACE
    | 'project-file' // .siyuan-cli.yaml discovered by walking up from cwd
    | 'process-binding' // workspace attached to the caller's process scope
    | 'global-current' // fallback to config.current
    | 'ad-hoc'; // --baseUrl path, no workspace name involved

/** Diagnostics for a selection that came from the caller's process binding. */
export interface BindingProvenance {
    anchor: ProcessNode;
    strength: ProcessIdentityStrength;
    /** When the binding was confirmed. */
    boundAt: string;
    /** Working directory at bind time; diagnostic context, not identity. */
    cwd?: string;
}

export interface ResolvedWorkspace extends WorkspaceEntry {
    name: string;
    token?: string;
    /** How this workspace name was chosen. */
    source: WorkspaceResolutionSource;
    /** Present when the selection came from the caller's process binding. */
    binding?: BindingProvenance;
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
            'No active workspace. Run `siyuan-cli workspace add <name> --url <url>` first.',
            'Or pass --workspace <name> to specify one explicitly.'
        );
    }

    const entry = config.workspaces[name];
    if (!entry) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_NOT_FOUND',
            `Workspace "${name}" not found in config.`,
            'Run `siyuan-cli workspace list` to see available workspaces.'
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
 *   - project-file workspace name (priority between env and process binding)
 *   - caller process binding (priority between project file and global-current)
 *   - project-file permission/behavior overrides (attached as effective*)
 *
 * Flag and env outrank both the project file and the binding. When the
 * project file and the binding both select a workspace, they must agree;
 * disagreement is a configuration error, never a silent winner.
 *
 * Workspace-management commands (add/list/remove/verify <name>/show) should
 * keep using resolveWorkspace() directly — they operate on the global config
 * and should not be perturbed by the current directory or the binding.
 */
export interface ResolveEffectiveOptions {
    /** Injectable process ancestry for tests; defaults to the real host. */
    processTreeHost?: ProcessTreeHost;
}

export function resolveEffectiveWorkspace(
    config: AppConfig,
    overrides: WorkspaceOverrides = {},
    cwd: string = process.cwd(),
    options: ResolveEffectiveOptions = {}
): ResolvedWorkspace {
    // ad-hoc mode short-circuits everything. No project file, no binding.
    if (overrides.baseUrl) {
        return resolveWorkspace(config, overrides);
    }

    const location = findProjectConfig(cwd);
    const projectConfig = location ? loadProjectConfig(location, config) : null;
    const projectOverlay = {
        ...(projectConfig?.permission
            ? { effectivePermission: projectConfig.permission }
            : {}),
        ...(projectConfig?.behavior
            ? { effectiveBehavior: projectConfig.behavior }
            : {}),
        ...(location ? { projectConfigPath: location.path } : {})
    };

    // Explicit invocation-level selection wins over everything below it.
    if (overrides.workspace || process.env['SIYUAN_CLI_WORKSPACE']) {
        return { ...resolveWorkspace(config, overrides), ...projectOverlay };
    }

    // Caller-scoped selection: the process binding and the project file must
    // agree when both select a workspace. When both agree, the binding is
    // reported as the source because it carries the anchor diagnostics.
    const scope = findActiveBinding(options.processTreeHost);
    const boundName = scope?.binding.workspace;
    const projectName = projectConfig?.workspace;

    if (projectName && boundName && projectName !== boundName) {
        throw new CliError(
            ExitCode.CONFIG,
            'CURRENT_SELECTION_CONFLICT',
            `The project file selects workspace "${projectName}" but the process binding selects "${boundName}".`,
            'Pass --workspace <name> to choose explicitly for this call, or run `siyuan-cli current unbind` or fix the project file.',
            {
                projectWorkspace: projectName,
                boundWorkspace: boundName,
                ...(location ? { projectConfigPath: location.path } : {})
            }
        );
    }

    const selectedName = boundName ?? projectName;
    const base = selectedName
        ? resolveWorkspace(config, { workspace: selectedName })
        : resolveWorkspace(config, {});
    const source: WorkspaceResolutionSource = boundName
        ? 'process-binding'
        : projectName
          ? 'project-file'
          : base.source;

    return {
        ...base,
        source,
        ...(scope
            ? {
                  binding: {
                      anchor: scope.binding.anchor,
                      strength: scope.match.strength,
                      boundAt: scope.binding.boundAt,
                      ...(scope.binding.cwd ? { cwd: scope.binding.cwd } : {})
                  }
              }
            : {}),
        ...projectOverlay
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
            'Use `siyuan-cli workspace add` with --url or --workspace-dir.'
        );
    }
    const resolved = await resolveWorkspaceDirToBaseUrl(
        workspace.workspaceDir,
        {
            token: workspace.token
        }
    );
    return {
        ...workspace,
        baseUrl: resolved.baseUrl
    };
}

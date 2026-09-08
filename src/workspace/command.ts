/**
 * `siyuan-cli workspace` subcommands — the global catalog and named-connection
 * checks. Selection operations live under `siyuan-cli current`; `use` and
 * `which` remain only as deprecated aliases.
 */
import { defineCommand } from 'citty';
import {
    loadConfig,
    saveConfig,
    resolveWorkspace,
    resolveEffectiveWorkspace,
    materializeWorkspace,
    type ResolvedWorkspace,
    type WorkspaceEntry
} from './config.js';
import { SiyuanClient } from '../shared/client.js';
import { CliError, ExitCode, fatalError, toCliError } from '../shared/errors.js';
import { diagnoseConnection } from './diagnostics.js';
import { getConfigPath } from './paths.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function out(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function tryRun(fn: () => Promise<void>): Promise<void> {
    return fn().catch((e) => {
        fatalError(toCliError(e));
    });
}

function emitDeprecatedWarning(message: string): void {
    process.stderr.write(JSON.stringify({ warning: 'DEPRECATED', message }) + '\n');
}

function bindingDiagnostics(resolved: ResolvedWorkspace) {
    if (!resolved.binding) return null;
    return {
        workspace: resolved.name,
        pid: resolved.binding.anchor.pid,
        name: resolved.binding.anchor.name ?? null,
        startId: resolved.binding.anchor.startId ?? null,
        strength: resolved.binding.strength,
        commandSummary: resolved.binding.anchor.commandSummary ?? null,
        boundAt: resolved.binding.boundAt,
        boundCwd: resolved.binding.cwd ?? null
    };
}

// ─── add ─────────────────────────────────────────────────────────────────────

const addCommand = defineCommand({
    meta: {
        name: 'add',
        description: 'Add a SiYuan workspace to the config.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name (unique identifier)',
            required: true
        },
        url: {
            type: 'string',
            description: 'SiYuan kernel base URL',
            default: 'http://127.0.0.1:6806',
            alias: 'u'
        },
        token: {
            type: 'string',
            description: 'Authentication token (optional)',
            alias: 't'
        },
        'token-env': {
            type: 'string',
            description: 'Read token from environment variable'
        },
        'token-file': {
            type: 'string',
            description: 'Read token from file (first line)'
        },
        'token-command': {
            type: 'string',
            description: 'Read token from command stdout'
        },
        'set-current': {
            type: 'boolean',
            description: 'Set this workspace as the current active workspace',
            default: false
        },
        'skip-verify': {
            type: 'boolean',
            description: 'Skip connectivity verification after adding',
            default: false
        },
        force: {
            type: 'boolean',
            description: 'Overwrite existing workspace with the same name',
            default: false
        },
        'workspace-dir': {
            type: 'string',
            description: 'Workspace directory for local port auto-discovery (alternative to --url)'
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            const config = loadConfig();

            if (config.workspaces[args.name] && !args.force) {
                throw new CliError(
                    ExitCode.CONFIG,
                    'WORKSPACE_EXISTS',
                    `Workspace "${args.name}" already exists. Use --force to overwrite.`
                );
            }

            const tokenModes = [
                args.token ? 1 : 0,
                args['token-env'] ? 1 : 0,
                args['token-file'] ? 1 : 0,
                args['token-command'] ? 1 : 0
            ].reduce((a, b) => a + b, 0);
            if (tokenModes > 1) {
                throw new CliError(
                    ExitCode.CONFIG,
                    'TOKEN_MODE_CONFLICT',
                    'Use only one of --token / --token-env / --token-file / --token-command.'
                );
            }

            const recommendedPermission: WorkspaceEntry['permission'] = {
                default: 'allow',
                rules: [
                    {
                        action: 'write',
                        effect: 'approval',
                        note: 'Confirm write operations'
                    },
                    {
                        action: 'invoke',
                        effect: 'approval',
                        note: 'Confirm invoke operations'
                    }
                ]
            };

            const entry: WorkspaceEntry = {
                ...(args['workspace-dir']
                    ? { workspaceDir: args['workspace-dir'] }
                    : { baseUrl: args.url }),
                ...(args.token ? { token: args.token } : {}),
                ...(args['token-env']
                    ? {
                          tokenSource: {
                              type: 'env' as const,
                              value: args['token-env']
                          }
                      }
                    : {}),
                ...(args['token-file']
                    ? {
                          tokenSource: {
                              type: 'file' as const,
                              value: args['token-file']
                          }
                      }
                    : {}),
                ...(args['token-command']
                    ? {
                          tokenSource: {
                              type: 'command' as const,
                              value: args['token-command']
                          }
                      }
                    : {}),
                permission: recommendedPermission
            };

            // Verify connectivity unless skipped
            if (!args['skip-verify']) {
                const verifyConfig = {
                    ...config,
                    workspaces: { ...config.workspaces, [args.name]: entry },
                    current: args.name
                };
                const resolved = resolveWorkspace(verifyConfig, {
                    workspace: args.name
                });
                const materialized = await materializeWorkspace(resolved);
                const client = new SiyuanClient(materialized);
                const ping = await client.ping();
                if (!ping.ok) {
                    const diagnosis = await diagnoseConnection(materialized.baseUrl);
                    const hint =
                        diagnosis.hints.length > 0
                            ? diagnosis.hints.join(' | ')
                            : 'Use --skip-verify to add without checking, or fix the URL/token.';
                    throw new CliError(
                        ExitCode.NETWORK,
                        'VERIFY_FAILED',
                        `Cannot connect to ${materialized.baseUrl}: ${ping.message}`,
                        hint,
                        { diagnosis }
                    );
                }
            }

            config.workspaces[args.name] = entry;

            // Auto-set current if first workspace or explicitly requested
            if (!config.current || args['set-current']) {
                config.current = args.name;
            }

            saveConfig(config);

            out({
                added: args.name,
                baseUrl: args['workspace-dir'] ? '(auto-discovered)' : args.url,
                ...(args['workspace-dir']
                    ? { workspaceDir: args['workspace-dir'] }
                    : {}),
                hasToken: !!args.token || !!entry.tokenSource,
                tokenSource: entry.tokenSource ?? null,
                isCurrent: config.current === args.name,
                permission: {
                    default: recommendedPermission.default,
                    rules: recommendedPermission.rules,
                    hint: 'Recommended approval rules were installed. Edit config.yaml to relax or tighten them.',
                    configPath: getConfigPath()
                }
            });
        })
});

// ─── list ─────────────────────────────────────────────────────────────────────

const listCommand = defineCommand({
    meta: {
        name: 'list',
        description: 'List all configured workspaces.'
    },
    run: () =>
        tryRun(async () => {
            const config = loadConfig();
            const workspaces = Object.entries(config.workspaces).map(
                ([name, ws]) => ({
                    name,
                    baseUrl: ws.baseUrl ?? (ws.workspaceDir ? '(auto)' : 'unknown'),
                    hasToken: !!ws.token || !!ws.tokenSource,
                    tokenSource: ws.tokenSource ?? null,
                    isCurrent: name === config.current
                })
            );
            out({ current: config.current, workspaces });
        })
});

// ─── use (deprecated alias of current global) ────────────────────────────────

const useCommand = defineCommand({
    meta: {
        name: 'use',
        description: 'Deprecated: use `siyuan-cli current global <name>`.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name to activate',
            required: true
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            emitDeprecatedWarning(
                '`workspace use` is deprecated; use `siyuan-cli current global <name>` instead.'
            );
            const config = loadConfig();
            if (!config.workspaces[args.name]) {
                throw new CliError(
                    ExitCode.CONFIG,
                    'WORKSPACE_NOT_FOUND',
                    `Workspace "${args.name}" not found in config.`,
                    'Run `siyuan-cli workspace list` to see available workspaces.'
                );
            }
            config.current = args.name;
            saveConfig(config);
            out({
                status: 'current-set',
                current: args.name,
                note: 'Global default updated. This is machine-wide; prefer `siyuan-cli current bind` for caller-scoped selection.'
            });
        })
});

// ─── verify ───────────────────────────────────────────────────────────────────

const verifyCommand = defineCommand({
    meta: {
        name: 'verify',
        description: 'Verify named workspace connections from the global catalog.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name to verify',
            required: false
        },
        all: {
            type: 'boolean',
            description: 'Verify all workspaces',
            default: false
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            const config = loadConfig();

            // Catalog verification only. The selection chain for the current
            // call is checked by `siyuan-cli current verify`.
            if (!args.all && !args.name) {
                throw new CliError(
                    ExitCode.CONFIG,
                    'VERIFY_MODE_CONFLICT',
                    'Specify a workspace name or use --all.',
                    'Use `siyuan-cli current verify` to check the effective selection for this call.'
                );
            }

            if (args.all) {
                const results: unknown[] = [];
                for (const name of Object.keys(config.workspaces)) {
                    const t0 = Date.now();
                    try {
                        const resolved = resolveWorkspace(config, {
                            workspace: name
                        });
                        const materialized = await materializeWorkspace(resolved);
                        const client = new SiyuanClient(materialized);
                        const ping = await client.ping();
                        const diagnosis = ping.ok
                            ? undefined
                            : await diagnoseConnection(materialized.baseUrl);
                        results.push({
                            workspace: name,
                            baseUrl: materialized.baseUrl,
                            ok: ping.ok,
                            version: ping.version,
                            message: ping.message,
                            elapsedMs: Date.now() - t0,
                            ...(diagnosis ? { diagnosis } : {})
                        });
                    } catch (e) {
                        const err = toCliError(e);
                        results.push({
                            workspace: name,
                            ok: false,
                            message: err.message,
                            error: err.errorType,
                            elapsedMs: Date.now() - t0
                        });
                    }
                }
                out(results);
                return;
            }

            const resolved = resolveWorkspace(config, { workspace: args.name });

            const materialized = await materializeWorkspace(resolved);
            const t0 = Date.now();
            const client = new SiyuanClient(materialized);
            const ping = await client.ping();
            const diagnosis = ping.ok
                ? undefined
                : await diagnoseConnection(materialized.baseUrl);
            const result = {
                ok: ping.ok,
                workspace: resolved.name,
                source: resolved.source,
                projectConfigPath: resolved.projectConfigPath ?? null,
                baseUrl: materialized.baseUrl,
                version: ping.version,
                message: ping.message,
                elapsedMs: Date.now() - t0,
                ...(diagnosis ? { diagnosis } : {})
            };

            if (!ping.ok) {
                process.stderr.write(
                    JSON.stringify({ error: 'VERIFY_FAILED', ...result }) + '\n'
                );
                process.exit(ExitCode.NETWORK);
            }

            out(result);
        })
});

// ─── show ─────────────────────────────────────────────────────────────────────

const showCommand = defineCommand({
    meta: {
        name: 'show',
        description: 'Show details of a workspace.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name (defaults to current)',
            required: false
        },
        'reveal-token': {
            type: 'boolean',
            description: 'Include the raw token value in output',
            default: false
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            const config = loadConfig();
            const resolved = resolveWorkspace(config, { workspace: args.name });
            const ws = config.workspaces[resolved.name]!;

            out({
                name: resolved.name,
                baseUrl: resolved.baseUrl ?? null,
                workspaceDir: resolved.workspaceDir ?? null,
                isCurrent: resolved.name === config.current,
                token: args['reveal-token']
                    ? (resolved.token ?? null)
                    : ws.token || ws.tokenSource
                      ? '[hidden]'
                      : null,
                tokenSource: ws.tokenSource ?? null
            });
        })
});

// ─── remove ───────────────────────────────────────────────────────────────────

const removeCommand = defineCommand({
    meta: {
        name: 'remove',
        description: 'Remove a workspace from the config.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name to remove',
            required: true
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            const config = loadConfig();

            if (!config.workspaces[args.name]) {
                throw new CliError(
                    ExitCode.CONFIG,
                    'WORKSPACE_NOT_FOUND',
                    `Workspace "${args.name}" not found.`
                );
            }

            delete config.workspaces[args.name];

            if (config.current === args.name) {
                config.current = '';
                process.stderr.write(
                    JSON.stringify({
                        warning:
                            'Removed the active workspace. Run `siyuan-cli workspace use <name>` to set a new one.'
                    }) + '\n'
                );
            }

            saveConfig(config);
            out({ removed: args.name });
        })
});

// ─── which (deprecated alias of current which) ───────────────────────────────

const whichCommand = defineCommand({
    meta: {
        name: 'which',
        description: 'Deprecated: use `siyuan-cli current which`.'
    },
    args: {
        cwd: {
            type: 'string',
            description: 'Directory to resolve from (defaults to current)',
            required: false
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            emitDeprecatedWarning(
                '`workspace which` is deprecated; use `siyuan-cli current which` instead.'
            );
            const config = loadConfig();
            let resolved: ResolvedWorkspace;
            try {
                resolved = resolveEffectiveWorkspace(
                    config,
                    {},
                    args.cwd ?? process.cwd()
                );
            } catch (error) {
                if (error instanceof CliError && error.errorType === 'NO_WORKSPACE') {
                    out({
                        status: 'none',
                        workspace: null,
                        source: 'none',
                        projectConfigPath: null,
                        binding: null,
                        hint: error.hint ?? error.message
                    });
                    return;
                }
                throw error;
            }
            out({
                status: 'resolved',
                workspace: resolved.name,
                source: resolved.source,
                baseUrl: resolved.baseUrl ?? null,
                workspaceDir: resolved.workspaceDir ?? null,
                projectConfigPath: resolved.projectConfigPath ?? null,
                binding: bindingDiagnostics(resolved)
            });
        })
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const workspaceCommand = defineCommand({
    meta: {
        name: 'workspace',
        description: 'Manage SiYuan workspace connections.'
    },
    subCommands: {
        add: addCommand,
        list: listCommand,
        use: useCommand,
        verify: verifyCommand,
        show: showCommand,
        remove: removeCommand,
        which: whichCommand
    }
});

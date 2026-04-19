/**
 * `siyuan workspace` subcommands.
 * See design.md §5 for output formats.
 */
import { defineCommand } from 'citty';
import {
    loadConfig,
    saveConfig,
    resolveWorkspace,
    type WorkspaceEntry
} from '../core/config.js';
import { SiyuanClient } from '../core/client.js';
import { CliError, ExitCode, fatalError, toCliError } from '../utils/errors.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function out(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function tryRun(fn: () => Promise<void>): Promise<void> {
    return fn().catch((e) => {
        fatalError(toCliError(e));
    });
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

            const entry: WorkspaceEntry = {
                baseUrl: args.url,
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
                    : {})
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
                const client = new SiyuanClient(resolved);
                const ping = await client.ping();
                if (!ping.ok) {
                    throw new CliError(
                        ExitCode.NETWORK,
                        'VERIFY_FAILED',
                        `Cannot connect to ${args.url}: ${ping.message}`,
                        'Use --skip-verify to add without checking, or fix the URL/token.'
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
                baseUrl: args.url,
                hasToken: !!args.token || !!entry.tokenSource,
                tokenSource: entry.tokenSource ?? null,
                isCurrent: config.current === args.name
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
                    baseUrl: ws.baseUrl,
                    hasToken: !!ws.token || !!ws.tokenSource,
                    tokenSource: ws.tokenSource ?? null,
                    isCurrent: name === config.current
                })
            );
            out({ current: config.current, workspaces });
        })
});

// ─── use ──────────────────────────────────────────────────────────────────────

const useCommand = defineCommand({
    meta: {
        name: 'use',
        description: 'Set the active workspace.'
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
            const config = loadConfig();

            if (!config.workspaces[args.name]) {
                throw new CliError(
                    ExitCode.CONFIG,
                    'WORKSPACE_NOT_FOUND',
                    `Workspace "${args.name}" not found.`,
                    `Run \`siyuan workspace list\` to see available workspaces.`
                );
            }

            config.current = args.name;
            saveConfig(config);

            out({ current: args.name });
        })
});

// ─── verify ───────────────────────────────────────────────────────────────────

const verifyCommand = defineCommand({
    meta: {
        name: 'verify',
        description: 'Verify connectivity to a workspace.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name (defaults to current)',
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

            if (args.all) {
                const results: unknown[] = [];
                for (const [name, ws] of Object.entries(config.workspaces)) {
                    const t0 = Date.now();
                    const client = new SiyuanClient(ws);
                    const ping = await client.ping();
                    results.push({
                        workspace: name,
                        baseUrl: ws.baseUrl,
                        ok: ping.ok,
                        version: ping.version,
                        message: ping.message,
                        elapsedMs: Date.now() - t0
                    });
                }
                out(results);
                return;
            }

            const resolved = resolveWorkspace(config, { workspace: args.name });
            const t0 = Date.now();
            const client = new SiyuanClient(resolved);
            const ping = await client.ping();
            const result = {
                ok: ping.ok,
                workspace: resolved.name,
                baseUrl: resolved.baseUrl,
                version: ping.version,
                message: ping.message,
                elapsedMs: Date.now() - t0
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
                baseUrl: ws.baseUrl,
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
                            'Removed the active workspace. Run `siyuan workspace use <name>` to set a new one.'
                    }) + '\n'
                );
            }

            saveConfig(config);
            out({ removed: args.name });
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
        remove: removeCommand
    }
});

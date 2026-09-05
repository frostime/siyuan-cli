/**
 * `siyuan-cli current` — caller-scoped workspace selection.
 *
 * Owns the selection command surface: the two-step process binding
 * (bind/confirm/unbind), the machine-global default (global), and selection
 * reporting/checks (which/verify). This layer only shapes CLI input and
 * output; selection mechanics live in workspace/process-binding.ts and
 * workspace/resolve.ts, and the workspace catalog stays under
 * `siyuan-cli workspace`.
 */
import { defineCommand } from 'citty';
import {
    loadConfig,
    saveConfig,
    resolveEffectiveWorkspace,
    materializeWorkspace,
    type AppConfig,
    type ResolvedWorkspace
} from '../workspace/config.js';
import { findProjectConfig, loadProjectConfig } from '../workspace/project-config.js';
import {
    confirmPendingProbe,
    createPendingProbe,
    getPendingProbe,
    unbindProcessScope
} from '../workspace/process-binding.js';
import { SiyuanClient } from '../shared/client.js';
import { CliError, ExitCode, fatalError, toCliError } from '../shared/errors.js';
import { diagnoseConnection } from '../workspace/diagnostics.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function out(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function tryRun(fn: () => Promise<void>): Promise<void> {
    return fn().catch((e) => {
        fatalError(toCliError(e));
    });
}

function assertWorkspaceExists(config: AppConfig, name: string): void {
    if (!config.workspaces[name]) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_NOT_FOUND',
            `Workspace "${name}" not found in config.`,
            'Run `siyuan-cli workspace list` to see available workspaces.'
        );
    }
}

/** Binding diagnostics for selection reports (which/verify output). */
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

// ─── Selection operations reused by deprecated workspace aliases ─────────────

export async function runCurrentGlobal(name: string): Promise<void> {
    const config = loadConfig();
    assertWorkspaceExists(config, name);
    config.current = name;
    saveConfig(config);
    out({
        status: 'current-set',
        current: name,
        note: 'Global default updated. This is machine-wide; prefer `siyuan-cli current bind` for caller-scoped selection.'
    });
}

export async function runCurrentWhich(cwd: string = process.cwd()): Promise<void> {
    const config = loadConfig();
    let resolved: ResolvedWorkspace;
    try {
        resolved = resolveEffectiveWorkspace(config, {}, cwd);
    } catch (e) {
        // `which` reports the selection; an empty selection is an answer,
        // not a failure. Conflicts and other errors still fail loudly.
        if (e instanceof CliError && e.errorType === 'NO_WORKSPACE') {
            out({
                status: 'none',
                workspace: null,
                source: 'none',
                projectConfigPath: null,
                binding: null,
                hint: e.hint ?? e.message
            });
            return;
        }
        throw e;
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
}

// ─── bind ────────────────────────────────────────────────────────────────────

const bindCommand = defineCommand({
    meta: {
        name: 'bind',
        description:
            'Start two-step binding of a workspace to this process scope.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name to bind (must already exist in the catalog)',
            required: true
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            const config = loadConfig();
            assertWorkspaceExists(config, args.name);

            // A disagreeing project file would poison every later resolution,
            // so the conflict fails here before any pending state is created.
            const location = findProjectConfig(process.cwd());
            if (location) {
                const projectWorkspace = loadProjectConfig(location, config)?.workspace;
                if (projectWorkspace && projectWorkspace !== args.name) {
                    throw new CliError(
                        ExitCode.CONFIG,
                        'CURRENT_SELECTION_CONFLICT',
                        `The project file selects workspace "${projectWorkspace}" but bind targets "${args.name}".`,
                        'Bind the same workspace as the project file, adjust the project file, or use explicit --workspace per call.',
                        {
                            projectWorkspace,
                            bindWorkspace: args.name,
                            projectConfigPath: location.path
                        }
                    );
                }
            }

            const probe = createPendingProbe(args.name);
            out({
                status: 'pending',
                workspace: args.name,
                nonce: probe.nonce,
                message: `Process probe captured for workspace "${args.name}". Run the confirm command in a new independent call; the nonce pairs the two calls. If this is not the intended workspace, run the cancel command instead.`,
                confirm: {
                    command: `siyuan-cli current confirm ${probe.nonce}`,
                    note: 'Run this in a new independent tool call.'
                },
                cancel: {
                    command: 'siyuan-cli current unbind',
                    note: 'Run this if this is not the intended workspace.'
                },
                projectConfigPath: location?.path ?? null,
                expiresInMinutes: 15
            });
        })
});

// ─── confirm ─────────────────────────────────────────────────────────────────

const confirmCommand = defineCommand({
    meta: {
        name: 'confirm',
        description:
            'Confirm a pending bind from a new independent call and anchor the binding.'
    },
    args: {
        nonce: {
            type: 'positional',
            description: 'Nonce printed by `current bind`',
            required: true
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            const probe = getPendingProbe(args.nonce);

            // The project file is re-checked at confirm time: a file that
            // appeared or changed between bind and confirm must fail loudly
            // instead of silently pairing a conflicting selection.
            const config = loadConfig();
            const location = findProjectConfig(process.cwd());
            if (location) {
                const projectWorkspace = loadProjectConfig(location, config)?.workspace;
                if (projectWorkspace && projectWorkspace !== probe.workspace) {
                    throw new CliError(
                        ExitCode.CONFIG,
                        'CURRENT_SELECTION_CONFLICT',
                        `The project file now selects workspace "${projectWorkspace}" but the pending bind targets "${probe.workspace}".`,
                        'Adjust the project file, or run `siyuan-cli current unbind` and bind again.',
                        {
                            projectWorkspace,
                            bindWorkspace: probe.workspace,
                            projectConfigPath: location.path
                        }
                    );
                }
            }

            const { binding, match } = confirmPendingProbe(args.nonce);
            out({
                status: 'bound',
                workspace: binding.workspace,
                anchor: {
                    pid: binding.anchor.pid,
                    name: binding.anchor.name ?? null,
                    startId: binding.anchor.startId ?? null,
                    strength: match.strength,
                    commandSummary: binding.anchor.commandSummary ?? null
                },
                boundAt: binding.boundAt,
                boundCwd: binding.cwd ?? null,
                message: `Workspace "${binding.workspace}" is bound to this process scope. Subsequent \`siyuan-cli api\` and \`siyuan-cli tool\` calls in this scope resolve to it without --workspace.`,
                inspect: 'siyuan-cli current which',
                release: 'siyuan-cli current unbind'
            });
        })
});

// ─── unbind ──────────────────────────────────────────────────────────────────

const unbindCommand = defineCommand({
    meta: {
        name: 'unbind',
        description:
            'Remove process bindings for the current scope and cancel pending binds.'
    },
    run: () =>
        tryRun(async () => {
            const result = unbindProcessScope();
            out({
                status:
                    result.removed > 0
                        ? 'unbound'
                        : result.pendingRemoved > 0
                          ? 'pending-cancelled'
                          : 'nothing-bound',
                removed: result.removed,
                pendingRemoved: result.pendingRemoved,
                message:
                    result.removed > 0
                        ? 'Bindings for this process scope were removed.'
                        : 'No confirmed binding matched this process scope.',
                note: 'Later calls resolve through the project file or the global default again.'
            });
        })
});

// ─── global ──────────────────────────────────────────────────────────────────

const globalCommand = defineCommand({
    meta: {
        name: 'global',
        description:
            'Set the machine-global default workspace (writes config.current).'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name to set as the global default',
            required: true
        }
    },
    run: ({ args }) => tryRun(async () => runCurrentGlobal(args.name))
});

// ─── which ───────────────────────────────────────────────────────────────────

const whichCommand = defineCommand({
    meta: {
        name: 'which',
        description:
            'Report which workspace this call resolves to and where the choice comes from. No network access.'
    },
    args: {
        cwd: {
            type: 'string',
            description: 'Directory to resolve from (defaults to current)',
            required: false
        }
    },
    run: ({ args }) =>
        tryRun(async () => runCurrentWhich(args.cwd ?? process.cwd()))
});

// ─── verify ──────────────────────────────────────────────────────────────────

const verifyCommand = defineCommand({
    meta: {
        name: 'verify',
        description:
            'Resolve the selection chain for this call and verify the workspace can reach its kernel.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Not accepted; use `workspace verify <name>` for named connections',
            required: false
        }
    },
    run: ({ args }) =>
        tryRun(async () => {
            if (args.name) {
                throw new CliError(
                    ExitCode.CONFIG,
                    'VERIFY_MODE_CONFLICT',
                    '`current verify` does not take a workspace name.',
                    'Use `siyuan-cli workspace verify <name|--all>` for named connections, or run `siyuan-cli current verify` without arguments.'
                );
            }
            const config = loadConfig();
            const resolved = resolveEffectiveWorkspace(config, {}, process.cwd());
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
                binding: bindingDiagnostics(resolved),
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

// ─── Export ───────────────────────────────────────────────────────────────────

export const currentCommand = defineCommand({
    meta: {
        name: 'current',
        description:
            'Caller-scoped workspace selection: process binding and the global default.'
    },
    subCommands: {
        bind: bindCommand,
        confirm: confirmCommand,
        unbind: unbindCommand,
        global: globalCommand,
        which: whichCommand,
        verify: verifyCommand
    }
});

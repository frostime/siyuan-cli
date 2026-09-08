/** `siyuan-cli current` — caller-scoped workspace selection. */
import { defineCommand } from 'citty';
import {
    loadConfig,
    materializeWorkspace,
    resolveEffectiveWorkspace,
    saveConfig,
    type AppConfig,
    type ResolvedWorkspace
} from './config.js';
import { findProjectConfig, loadProjectConfig } from './project-config.js';
import {
    cancelPendingProbe,
    confirmPendingProbe,
    createPendingProbe,
    getPendingProbe,
    pendingExpiresAt,
    unbindProcessScope,
    withPendingConfirmationRecovery
} from './binding/protocol.js';
import { SiyuanClient } from '../shared/client.js';
import {
    CliError,
    ExitCode,
    fatalError,
    toCliError
} from '../shared/errors.js';
import { preparePrintedOutput } from '../shared/output.js';
import { diagnoseConnection } from './diagnostics.js';

const printArg = {
    type: 'string' as const,
    description: 'Print mode: compact | json',
    default: 'compact'
};

type CurrentPrintMode = 'compact' | 'json';

function tryRun(fn: () => Promise<void>): Promise<void> {
    return fn().catch((error) => fatalError(toCliError(error)));
}

function printSuccess(
    print: CurrentPrintMode,
    details: unknown,
    compact: string | (() => string)
): void {
    const rendered = preparePrintedOutput({ print, details, compact });
    process.stdout.write(rendered.stdout + '\n');
}

function parsePrintMode(value: string): CurrentPrintMode {
    if (value === 'compact' || value === 'json') return value;
    throw new CliError(
        ExitCode.GENERAL,
        'PRINT_MODE_INVALID',
        `Unknown print mode "${value}".`,
        'Use --print compact or --print json.'
    );
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

function assertProjectCompatible(
    config: AppConfig,
    workspace: string,
    phase: 'bind' | 'confirm'
): string | undefined {
    const location = findProjectConfig(process.cwd());
    if (!location) return undefined;

    const projectWorkspace = loadProjectConfig(location, config)?.workspace;
    if (projectWorkspace && projectWorkspace !== workspace) {
        throw new CliError(
            ExitCode.CONFIG,
            'CURRENT_SELECTION_CONFLICT',
            phase === 'bind'
                ? `The project file selects workspace "${projectWorkspace}" but bind targets "${workspace}".`
                : `The project file now selects workspace "${projectWorkspace}" but the pending bind targets "${workspace}".`,
            'Make the project file and binding select the same workspace, or use explicit --workspace per call.',
            {
                projectWorkspace,
                bindWorkspace: workspace,
                projectConfigPath: location.path,
                bindingExists: false,
                pendingRetained: phase === 'confirm',
                requestSent: false
            }
        );
    }
    return location.path;
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

const bindCommand = defineCommand({
    meta: {
        name: 'bind',
        description:
            'Start two-step binding of a workspace to this process scope.'
    },
    args: {
        name: {
            type: 'positional',
            description:
                'Workspace name to bind (must already exist in the catalog)',
            required: true
        },
        print: printArg
    },
    run: ({ args }) =>
        tryRun(async () => {
            const print = parsePrintMode(args.print);
            const config = loadConfig();
            assertWorkspaceExists(config, args.name);
            const projectConfigPath = assertProjectCompatible(
                config,
                args.name,
                'bind'
            );
            const probe = createPendingProbe(args.name);
            const confirmCommand = `siyuan-cli current confirm ${probe.nonce}`;
            const cancelCommand = `siyuan-cli current cancel ${probe.nonce}`;
            const expiresAt = pendingExpiresAt(probe);
            const details = {
                status: 'pending',
                workspace: args.name,
                nonce: probe.nonce,
                bindingExists: false,
                pendingRetained: true,
                confirmCommand,
                cancelCommand,
                expiresAt,
                projectConfigPath: projectConfigPath ?? null,
                requestSent: false
            };
            printSuccess(print, details, () =>
                [
                    `Binding procedure started for workspace "${args.name}".`,
                    'Next: run this command in a new CLI invocation:',
                    `  ${confirmCommand}`,
                    'Cancel this pending confirmation with:',
                    `  ${cancelCommand}`,
                    `Expires: ${expiresAt}`,
                    'The binding takes effect only after confirmation succeeds.'
                ].join('\n')
            );
        })
});

const confirmCommand = defineCommand({
    meta: {
        name: 'confirm',
        description: 'Confirm a pending bind from a new independent call.'
    },
    args: {
        nonce: {
            type: 'positional',
            description: 'Nonce printed by `current bind`',
            required: true
        },
        print: printArg
    },
    run: ({ args }) =>
        tryRun(async () => {
            const print = parsePrintMode(args.print);
            const probe = getPendingProbe(args.nonce);
            let projectConfigPath: string | undefined;
            try {
                const config = loadConfig();
                assertWorkspaceExists(config, probe.workspace);
                projectConfigPath = assertProjectCompatible(
                    config,
                    probe.workspace,
                    'confirm'
                );
            } catch (error) {
                throw withPendingConfirmationRecovery(error, args.nonce);
            }

            const { binding, match } = confirmPendingProbe(args.nonce);
            const details = {
                status: 'bound',
                workspace: binding.workspace,
                bindingExists: true,
                pendingRetained: false,
                anchor: {
                    pid: binding.anchor.pid,
                    name: binding.anchor.name ?? null,
                    startId: binding.anchor.startId ?? null,
                    strength: match.strength,
                    commandSummary: binding.anchor.commandSummary ?? null
                },
                boundAt: binding.boundAt,
                boundCwd: binding.cwd ?? null,
                projectConfigPath: projectConfigPath ?? null,
                inspectCommand: 'siyuan-cli current which',
                unbindCommand: 'siyuan-cli current unbind',
                requestSent: false
            };
            printSuccess(print, details, () =>
                [
                    `Workspace "${binding.workspace}" is now bound to this process scope.`,
                    `Anchor: PID ${binding.anchor.pid} (${match.strength}).`,
                    'Subsequent workspace-aware calls in this scope can omit --workspace.',
                    'Inspect: siyuan-cli current which',
                    'Unbind: siyuan-cli current unbind'
                ].join('\n')
            );
        })
});

const cancelCommand = defineCommand({
    meta: {
        name: 'cancel',
        description:
            'Cancel one pending confirmation without process observation.'
    },
    args: {
        nonce: {
            type: 'positional',
            description: 'Nonce printed by `current bind`',
            required: true
        },
        print: printArg
    },
    run: ({ args }) =>
        tryRun(async () => {
            const print = parsePrintMode(args.print);
            const result = cancelPendingProbe(args.nonce);
            const details = {
                status: 'pending-cancelled',
                workspace: result.workspace,
                nonce: result.nonce,
                pendingRetained: false,
                confirmedBindingsChanged: false,
                requestSent: false
            };
            printSuccess(
                print,
                details,
                `Pending confirmation ${result.nonce} for workspace "${result.workspace}" was cancelled.\nConfirmed bindings were not changed.`
            );
        })
});

const unbindCommand = defineCommand({
    meta: {
        name: 'unbind',
        description: 'Remove confirmed bindings for the current process scope.'
    },
    args: { print: printArg },
    run: ({ args }) =>
        tryRun(async () => {
            const print = parsePrintMode(args.print);
            const result = unbindProcessScope();
            const details = {
                status: result.removed > 0 ? 'unbound' : 'nothing-bound',
                removed: result.removed,
                reclaimed: result.reclaimed,
                pendingConfirmationsChanged: false,
                requestSent: false
            };
            printSuccess(print, details, () =>
                result.removed > 0
                    ? `Removed ${result.removed} confirmed binding${result.removed === 1 ? '' : 's'} from this process scope.\nPending confirmations were not changed.`
                    : 'No confirmed binding matched this process scope.\nPending confirmations were not changed.'
            );
        })
});

const globalCommand = defineCommand({
    meta: {
        name: 'global',
        description: 'Set the machine-global default workspace.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Workspace name to set as the global default',
            required: true
        },
        print: printArg
    },
    run: ({ args }) =>
        tryRun(async () => {
            const print = parsePrintMode(args.print);
            const config = loadConfig();
            assertWorkspaceExists(config, args.name);
            config.current = args.name;
            saveConfig(config);
            const details = {
                status: 'current-set',
                current: args.name,
                scope: 'machine-global'
            };
            printSuccess(
                print,
                details,
                `Global default workspace set to "${args.name}".\nThis setting is machine-wide; prefer current bind for caller-scoped selection.`
            );
        })
});

const whichCommand = defineCommand({
    meta: {
        name: 'which',
        description:
            'Report the effective workspace selection. No network access.'
    },
    args: {
        cwd: {
            type: 'string',
            description: 'Directory to resolve from (defaults to current)',
            required: false
        },
        print: printArg
    },
    run: ({ args }) =>
        tryRun(async () => {
            const print = parsePrintMode(args.print);
            const config = loadConfig();
            let resolved: ResolvedWorkspace;
            try {
                resolved = resolveEffectiveWorkspace(
                    config,
                    {},
                    args.cwd ?? process.cwd()
                );
            } catch (error) {
                if (
                    error instanceof CliError &&
                    error.errorType === 'NO_WORKSPACE'
                ) {
                    const details = {
                        status: 'none',
                        workspace: null,
                        source: 'none',
                        projectConfigPath: null,
                        binding: null,
                        hint: error.hint ?? error.message,
                        requestSent: false
                    };
                    printSuccess(
                        print,
                        details,
                        `No workspace is selected.\n${details.hint}`
                    );
                    return;
                }
                throw error;
            }
            const details = {
                status: 'resolved',
                workspace: resolved.name,
                source: resolved.source,
                baseUrl: resolved.baseUrl ?? null,
                workspaceDir: resolved.workspaceDir ?? null,
                projectConfigPath: resolved.projectConfigPath ?? null,
                binding: bindingDiagnostics(resolved),
                requestSent: false
            };
            printSuccess(print, details, () =>
                [
                    `Workspace: ${resolved.name}`,
                    `Source: ${resolved.source}`,
                    resolved.baseUrl
                        ? `Base URL: ${resolved.baseUrl}`
                        : undefined,
                    resolved.workspaceDir
                        ? `Workspace directory: ${resolved.workspaceDir}`
                        : undefined
                ]
                    .filter((line): line is string => line !== undefined)
                    .join('\n')
            );
        })
});

const verifyCommand = defineCommand({
    meta: {
        name: 'verify',
        description:
            'Resolve this call and verify its SiYuan kernel connection.'
    },
    args: {
        name: {
            type: 'positional',
            description: 'Not accepted; use `workspace verify <name>`',
            required: false
        },
        print: printArg
    },
    run: ({ args }) =>
        tryRun(async () => {
            const print = parsePrintMode(args.print);
            if (args.name) {
                throw new CliError(
                    ExitCode.CONFIG,
                    'VERIFY_MODE_CONFLICT',
                    '`current verify` does not take a workspace name.',
                    'Use `siyuan-cli workspace verify <name|--all>` for named connections, or run `siyuan-cli current verify` without arguments.'
                );
            }
            const config = loadConfig();
            const resolved = resolveEffectiveWorkspace(
                config,
                {},
                process.cwd()
            );
            const materialized = await materializeWorkspace(resolved);
            const startedAt = Date.now();
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
                elapsedMs: Date.now() - startedAt,
                ...(diagnosis ? { diagnosis } : {})
            };
            if (!ping.ok) {
                process.stderr.write(
                    JSON.stringify({ error: 'VERIFY_FAILED', ...result }) + '\n'
                );
                process.exit(ExitCode.NETWORK);
            }
            printSuccess(
                print,
                result,
                `Workspace "${resolved.name}" verified at ${materialized.baseUrl}${ping.version ? ` (SiYuan ${ping.version})` : ''}.`
            );
        })
});

export const currentCommand = defineCommand({
    meta: {
        name: 'current',
        description: 'Caller-scoped workspace selection and the global default.'
    },
    subCommands: {
        bind: bindCommand,
        confirm: confirmCommand,
        cancel: cancelCommand,
        unbind: unbindCommand,
        global: globalCommand,
        which: whichCommand,
        verify: verifyCommand
    }
});

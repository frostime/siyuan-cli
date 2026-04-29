import { defineCommand, runCommand, showUsage } from 'citty';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { workspaceCommand } from './workspace/command.js';
import { apiCommand, getEndpointHelpEntry, renderGroupedApiHelp } from './api/command.js';
import { toolCommand, getToolHelpText, renderGroupedToolHelp } from './tool/command.js';
import { skillCommand } from './skill/command.js';
import { docCommand, formatDocsHint } from './doc/command.js';
import { approvalCommand } from './approval/command.js';
import {
    extensionCommand,
    getPendingExtensionCount,
    renderExtensionHelp
} from './extension/command.js';
import { buildEndpointHelp } from './shared/argv.js';

function getVersion(): string {
    try {
        const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
}

const main = defineCommand({
    meta: {
        name: 'siyuan',
        version: getVersion(),
        description: 'Agent-first CLI for SiYuan Note'
    },
    subCommands: {
        workspace: workspaceCommand,
        api: apiCommand,
        tool: toolCommand,
        doc: docCommand,
        skill: skillCommand,
        approval: approvalCommand,
        extension: extensionCommand
    }
});

async function customShowUsage<T extends Record<string, unknown>>(
    cmd: any,
    parent?: any
): Promise<void> {
    const meta =
        typeof cmd.meta === 'function' ? await cmd.meta() : await cmd.meta;
    const parentMeta = parent
        ? typeof parent.meta === 'function'
            ? await parent.meta()
            : await parent.meta
        : undefined;

    // Detect bare `siyuan api -h`
    if (meta?.name === 'api' && parentMeta?.name === 'siyuan') {
        process.stdout.write(renderGroupedApiHelp(parentMeta?.version) + '\n');
        return;
    }

    // Detect bare `siyuan tool -h`
    if (meta?.name === 'tool' && parentMeta?.name === 'siyuan') {
        process.stdout.write(renderGroupedToolHelp(parentMeta?.version) + '\n');
        return;
    }

    // Detect bare `siyuan extension -h`
    if (meta?.name === 'extension') {
        process.stdout.write(renderExtensionHelp(parentMeta?.version) + '\n');
        return;
    }

    // Detect `siyuan api <endpoint-id> --help`
    if (parentMeta?.name === 'api' && meta?.name) {
        const entry = getEndpointHelpEntry(meta.name);
        if (entry) {
            process.stdout.write(buildEndpointHelp(entry) + '\n');
            return;
        }
    }

    // Detect `siyuan tool <tool-id> --help`
    if (parentMeta?.name === 'tool' && meta?.name) {
        const help = getToolHelpText(meta.name);
        if (help) {
            process.stdout.write(help + '\n');
            return;
        }
    }

    await showUsage(cmd, parent);

    if (!parent || meta?.name === 'doc' || parentMeta?.name === 'doc') {
        process.stdout.write(formatDocsHint());
    }
}

function resolveValue<T>(input: T | Promise<T> | (() => T) | (() => Promise<T>)):
    Promise<T> {
    return typeof input === 'function'
        ? Promise.resolve((input as () => T | Promise<T>)())
        : Promise.resolve(input as T | Promise<T>);
}

async function resolveCommandForArgs(
    cmd: any,
    rawArgs: string[],
    parent?: any
): Promise<[any, any?]> {
    const subCommands = await resolveValue(cmd.subCommands);
    if (subCommands && Object.keys(subCommands).length > 0) {
        const subCommandArgIndex = rawArgs.findIndex((arg) => !arg.startsWith('-'));
        const subCommandName = rawArgs[subCommandArgIndex];
        if (subCommandName && subCommands[subCommandName]) {
            const subCommand = await resolveValue(subCommands[subCommandName]);
            if (subCommand) {
                return resolveCommandForArgs(
                    subCommand,
                    rawArgs.slice(subCommandArgIndex + 1),
                    cmd
                );
            }
        }
    }
    return [cmd, parent];
}

function getUnknownCommandHint(rawArgs: string[], error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || (error as { code?: string }).code !== 'E_UNKNOWN_COMMAND') {
        return undefined;
    }
    const command = rawArgs.find((arg) => !arg.startsWith('-'));
    if (command !== 'api' && command !== 'tool') {
        return undefined;
    }
    const pending = getPendingExtensionCount(command);
    if (pending === 0) {
        return undefined;
    }
    const label = command === 'api' ? 'API' : 'tool';
    return `Found ${pending} uncached or stale ${label} extension(s). Run \`siyuan extension cache\` and retry.`;
}

async function runCli(): Promise<void> {
    const rawArgs = process.argv.slice(2);

    try {
        if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
            await customShowUsage(...(await resolveCommandForArgs(main, rawArgs)));
            process.exit(0);
        }

        if (rawArgs.length === 1 && rawArgs[0] === '--version') {
            const meta =
                typeof main.meta === 'function' ? await main.meta() : await main.meta;
            if (!meta?.version) {
                throw new Error('No version specified');
            }
            process.stdout.write(meta.version + '\n');
            return;
        }

        await runCommand(main, { rawArgs });
    } catch (error) {
        await customShowUsage(...(await resolveCommandForArgs(main, rawArgs)));
        const hint = getUnknownCommandHint(rawArgs, error);
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(message + '\n');
        if (hint) {
            process.stderr.write(hint + '\n');
        }
        process.exit(1);
    }
}

void runCli();

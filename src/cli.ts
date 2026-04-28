import { defineCommand, runMain, showUsage } from 'citty';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { workspaceCommand } from './workspace/command.js';
import { apiCommand, getEndpointHelpEntry } from './api/command.js';
import { toolCommand, getToolHelpText } from './tool/command.js';
import { skillCommand } from './skill/command.js';
import { docCommand, formatDocsHint } from './doc/command.js';
import { approvalCommand } from './approval/command.js';
import { extensionCommand } from './extension/command.js';
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
    const rawArgs = process.argv.slice(2);

    if (rawArgs[0] === 'api' && rawArgs[1] && rawArgs[1] !== 'list' && rawArgs[1] !== 'describe') {
        const entry = getEndpointHelpEntry(rawArgs[1]);
        if (entry) {
            process.stdout.write(buildEndpointHelp(entry) + '\n');
            return;
        }
    }

    if (rawArgs[0] === 'tool' && rawArgs[1] && rawArgs[1] !== 'list' && rawArgs[1] !== 'describe') {
        const help = getToolHelpText(rawArgs[1]);
        if (help) {
            process.stdout.write(help + '\n');
            return;
        }
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

runMain(main, { showUsage: customShowUsage });

import { defineCommand, runMain, showUsage } from 'citty';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { workspaceCommand } from './workspace/command.js';
import { apiCommand, getEndpointHelpEntry, renderGroupedApiHelp } from './api/command.js';
import { toolCommand, getToolHelpText, renderGroupedToolHelp } from './tool/command.js';
import { skillCommand } from './skill/command.js';
import { docCommand, formatDocsHint } from './doc/command.js';
import { approvalCommand } from './approval/command.js';
import { extensionCommand, renderExtensionHelp } from './extension/command.js';
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

runMain(main, { showUsage: customShowUsage });

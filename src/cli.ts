import { defineCommand, runMain, showUsage } from 'citty';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { workspaceCommand } from './commands/workspace.js';
import { apiCommand } from './commands/api.js';
import { toolCommand } from './commands/tool.js';
import { skillCommand } from './commands/skill.js';
import { docCommand, formatDocsHint } from './commands/doc.js';
import { buildEndpointHelp } from './core/argv.js';
import { registry } from './core/registry.js';
import { buildToolHelp, toolRegistry } from './core/tools.js';
import './tools/index.js';

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
        skill: skillCommand
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

    // Detect `siyuan api <endpoint-id> --help`
    if (parentMeta?.name === 'api' && meta?.name) {
        const entry = registry.get(meta.name);
        if (entry) {
            process.stdout.write(buildEndpointHelp(entry) + '\n');
            return;
        }
    }

    // Detect `siyuan tool <tool-id> --help`
    if (parentMeta?.name === 'tool' && meta?.name) {
        const tool = toolRegistry.get(meta.name);
        if (tool) {
            process.stdout.write(buildToolHelp(tool) + '\n');
            return;
        }
    }

    await showUsage(cmd, parent);

    if (!parent || meta?.name === 'doc' || parentMeta?.name === 'doc') {
        process.stdout.write(formatDocsHint());
    }
}

runMain(main, { showUsage: customShowUsage });

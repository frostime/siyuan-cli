import { defineCommand, runMain, showUsage } from 'citty';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'pathe';
import { workspaceCommand } from './commands/workspace.js';
import { apiCommand } from './commands/api.js';
import { toolCommand } from './commands/tool.js';
import { skillCommand } from './commands/skill.js';
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

    // Print docs path hint for top-level help only
    if (!parent) {
        const here = dirname(fileURLToPath(import.meta.url));
        // Packaged: dist/cli.mjs -> ../src/docs
        // Dev:      src/cli.ts  -> ./docs
        const docsPath = basename(here) === 'dist'
            ? join(here, '..', 'src', 'docs')
            : join(here, 'docs');
        process.stdout.write(
            `\nAgent SHOULD read built-in documents for guideline\n` +
            `  0. ${docsPath}/README.md -> Entry document.\n` +
            `  1. {docs}/siyuan-guide/*.md -> Read to understand SiYuan data model, SQL queries, etc.\n` +
            `  2. {docs}/cli-usage/*.md -> Read to understand CLI commands, config file format, permission rules.\n`
        );
    }
}

runMain(main, { showUsage: customShowUsage });

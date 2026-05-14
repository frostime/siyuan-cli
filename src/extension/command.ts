import { defineCommand } from 'citty';
import { colors } from 'consola/utils';
import { mkdirSync } from 'node:fs';
import { basename, join, relative } from 'pathe';
import { registry } from '../api/registry.js';
import { fatalError, toCliError } from '../shared/errors.js';
import { toolRegistry } from '../tool/registry.js';
import { getExtensionDir } from '../workspace/paths.js';
import {
    buildEndpointSchemaFromCache,
    buildToolSchemaFromCache,
    writeSchemaCache
} from './cache.js';
import {
    discoverEndpointExtensions,
    discoverToolExtensions,
    loadAllEndpointExtensions,
    loadAllToolExtensions
} from './loader.js';
import { scaffoldExtensionDir } from './init.js';

function out(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function formatGroup<T extends { source: string; cacheStatus: string; cached?: any }>(
    label: string,
    items: T[],
    root: string,
    getId: (item: T) => string | undefined,
    getSummary: (item: T) => string | undefined
): string[] {
    const lines = [`  ${label}:`];
    if (items.length === 0) {
        lines.push('    (none)');
        return lines;
    }
    for (const item of items) {
        const relSource = relative(root, item.source).replace(/\\/g, '/');
        const id = getId(item) ?? basename(item.source, '.ts').replace(/\.mjs$/i, '');
        const summary = getSummary(item) ?? '';
        const status = `[${item.cacheStatus}]`;
        lines.push(
            `    ${id.padEnd(16)} ${summary.padEnd(35)} ${status} (${relSource})`.trimEnd()
        );
    }
    return lines;
}

function renderList(root: string): string {
    const tools = discoverToolExtensions(join(root, 'tools'));
    const apis = discoverEndpointExtensions(join(root, 'apis'));
    const lines = [`Extensions (from ${root}):`, ''];

    lines.push(
        ...formatGroup(
            'Tools',
            tools,
            root,
            (item) => item.cached?.id,
            (item) => item.cached?.summary
        )
    );
    lines.push('');
    lines.push(
        ...formatGroup(
            'APIs',
            apis,
            root,
            (item) => item.cached?.endpoint,
            (item) => item.cached?.summary
        )
    );

    const pending = [...tools, ...apis].filter(
        (item) => item.cacheStatus !== 'cached'
    ).length;
    if (pending > 0) {
        lines.push('');
        lines.push(
            `[!] ${pending} extension(s) have stale/uncached/incompatible cache metadata. Run \`siyuan extension cache\` to refresh.`
        );
    }
    return lines.join('\n');
}

export type ExtensionKind = 'tool' | 'api';

export function getPendingExtensionCount(
    kind: ExtensionKind,
    root = getExtensionDir()
): number {
    const items =
        kind === 'tool'
            ? discoverToolExtensions(join(root, 'tools'))
            : discoverEndpointExtensions(join(root, 'apis'));
    return items.filter(
        (item) =>
            item.cacheStatus === 'uncached' ||
            item.cacheStatus === 'stale' ||
            item.cacheStatus === 'incompatible'
    ).length;
}

const initCommand = defineCommand({
    meta: { name: 'init', description: 'Scaffold the extensions directory.' },
    run: () => {
        const root = getExtensionDir();
        mkdirSync(root, { recursive: true });
        out(scaffoldExtensionDir(root));
    }
});

const listCommand = defineCommand({
    meta: { name: 'list', description: 'List discovered extensions.' },
    run: () => {
        process.stdout.write(renderList(getExtensionDir()) + '\n');
    }
});

const cacheCommand = defineCommand({
    meta: {
        name: 'cache',
        description: 'Load extensions and write schema cache files.'
    },
    run: async () => {
        const root = getExtensionDir();
        const toolDir = join(root, 'tools');
        const apiDir = join(root, 'apis');
        const lines = ['Caching extensions...'];
        let count = 0;

        for (const loaded of await loadAllToolExtensions(toolDir)) {
            const cachePath = writeSchemaCache(loaded.source, loaded.schema);
            toolRegistry.registerExtension(loaded.schema);
            const relSource = relative(root, loaded.source).replace(/\\/g, '/');
            lines.push(
                `  ${relSource} -> ${basename(cachePath ?? `${loaded.schema.id}.schema.json`)}    ✓`
            );
            count++;
        }

        for (const loaded of await loadAllEndpointExtensions(apiDir)) {
            const cachePath = writeSchemaCache(loaded.source, loaded.schema);
            registry.registerExtension(loaded.schema);
            const relSource = relative(root, loaded.source).replace(/\\/g, '/');
            lines.push(
                `  ${relSource} -> ${basename(cachePath ?? `${loaded.schema.endpoint}.schema.json`)}    ✓`
            );
            count++;
        }

        lines.push('');
        lines.push(`Cached ${count} extension(s).`);
        process.stdout.write(lines.join('\n') + '\n');
    }
});

export function renderExtensionHelp(version?: string): string {
    const root = getExtensionDir();
    const lines: string[] = [];
    const title = `Manage user extensions. (siyuan extension${version ? ` v${version}` : ''})`;
    lines.push(colors.gray(title));
    lines.push('');
    lines.push(`${colors.underline(colors.bold('USAGE'))} ${colors.cyan('siyuan extension <command>')}`);
    lines.push('');
    lines.push(colors.underline(colors.bold('COMMANDS')));
    lines.push('');
    lines.push(`  ${'init'.padEnd(8)}${colors.cyan('Scaffold the extensions directory.')}`);
    lines.push(`  ${'list'.padEnd(8)}${colors.cyan('List discovered extensions.')}`);
    lines.push(`  ${'cache'.padEnd(8)}${colors.cyan('Load extensions and write schema cache files.')}`);
    lines.push('');
    lines.push(colors.underline(colors.bold('EXTENSION ROOT')));
    lines.push('');
    lines.push(`  ${root}`);
    lines.push('');
    lines.push(colors.underline(colors.bold('LAYOUT')));
    lines.push('');
    lines.push(`  ${join(root, 'apis').replace(/\\/g, '/')}`);
    lines.push(`    export const schema  ${colors.gray('# EndpointSchema')}`);
    lines.push(`  ${join(root, 'tools').replace(/\\/g, '/')}`);
    lines.push(`    export const tool    ${colors.gray('# ToolSchema')}`);
    lines.push('');
    lines.push(colors.underline(colors.bold('COLD-START WORKFLOW')));
    lines.push('');
    lines.push(`  1. ${colors.cyan('siyuan extension init')}`);
    lines.push(`  2. create ${colors.cyan('apis/foo.ts')} or ${colors.cyan('tools/bar.ts')}`);
    lines.push(`  3. ${colors.cyan('siyuan extension cache')}`);
    lines.push(`  4. ${colors.cyan('siyuan extension list')}`);
    lines.push(`  5. ${colors.cyan('siyuan api|tool describe <id>')}`);
    lines.push(`  6. ${colors.cyan('siyuan api|tool <id> ...')}`);
    lines.push('');
    lines.push(colors.underline(colors.bold('DOCS')));
    lines.push('');
    lines.push(`  ${colors.cyan('siyuan doc read extension.md')}`);
    return lines.join('\n');
}

export const extensionCommand = defineCommand({
    meta: { name: 'extension', description: 'Manage user extensions.' },
    subCommands: {
        init: initCommand,
        list: listCommand,
        cache: cacheCommand
    }
});

export { buildToolSchemaFromCache, buildEndpointSchemaFromCache };

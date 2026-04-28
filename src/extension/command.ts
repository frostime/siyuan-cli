import { defineCommand } from 'citty';
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

    const uncached = [...tools, ...apis].filter(
        (item) => item.cacheStatus === 'uncached'
    ).length;
    if (uncached > 0) {
        lines.push('');
        lines.push(
            `[!] ${uncached} uncached extension(s). Run \`siyuan extension cache\` to populate metadata.`
        );
    }
    return lines.join('\n');
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

export const extensionCommand = defineCommand({
    meta: { name: 'extension', description: 'Manage user extensions.' },
    subCommands: {
        init: initCommand,
        list: listCommand,
        cache: cacheCommand
    }
});

export { buildToolSchemaFromCache, buildEndpointSchemaFromCache };

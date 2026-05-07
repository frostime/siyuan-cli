import { defineCommand } from 'citty';
import { colors } from 'consola/utils';
import { join } from 'pathe';
import { parsePayload } from '../shared/argv.js';
import { createJsonPrintExtra } from '../shared/output.js';
import { CliError, ExitCode, fatalError, toCliError } from '../shared/errors.js';
import { getExtensionDir } from '../workspace/paths.js';
import {
    buildToolSchemaFromCache,
    writeSchemaCache
} from '../extension/cache.js';
import {
    discoverToolExtensions,
    loadToolExtension,
    type DiscoveredExtension
} from '../extension/loader.js';
import {
    buildToolHelp,
    createToolContext,
    renderToolResult,
    toolRegistry
} from './registry.js';
import type { ToolSchema } from '../shared/schema.js';
import type { ToolSchemaCache } from '../extension/cache.js';

import './builtins/index.js';

const TOOL_EXTENSION_DIR = join(getExtensionDir(), 'tools');

const RESERVED_CLI_ARGS = new Set([
    'workspace',
    'debug',
    'dry-run',
    'yes',
    'print',
    'json',
    'file',
    'primary'
]);

// ————— Extension discovery —————

let discoveredToolsLoaded = false;
let discoveredToolExtensions: DiscoveredExtension<ToolSchemaCache>[] = [];
const discoveredToolSourcesById = new Map<string, string>();

function ensureToolDiscovery(): void {
    if (discoveredToolsLoaded) return;
    discoveredToolsLoaded = true;
    discoveredToolExtensions = discoverToolExtensions(TOOL_EXTENSION_DIR);
    for (const item of discoveredToolExtensions) {
        if (!item.cached) continue;
        const registered = toolRegistry.registerExtension(
            buildToolSchemaFromCache(item.cached)
        );
        if (registered) {
            discoveredToolSourcesById.set(item.cached.id, item.source);
        }
    }
}

/**
 * Resolve a tool for execution. If the tool is a user extension,
 * jiti-import the source to get the real `run()` function,
 * replacing the cache-only stub.
 */
async function resolveToolForExecution(
    id: string
): Promise<{ tool: ToolSchema; source?: string } | undefined> {
    ensureToolDiscovery();

    // If it's a known extension, full-import it
    const cachedSource = discoveredToolSourcesById.get(id);
    if (cachedSource) {
        try {
            const loaded = await loadToolExtension(cachedSource);
            toolRegistry.registerExtension(loaded.schema);
            return { tool: loaded.schema, source: cachedSource };
        } catch {
            // fall through to builtin lookup
        }
    }

    const builtin = toolRegistry.get(id);
    if (builtin) {
        return { tool: builtin };
    }

    // Try uncached extensions (no schema.json yet)
    for (const item of discoveredToolExtensions) {
        if (item.cached) continue;
        try {
            const loaded = await loadToolExtension(item.source);
            const loadedId = loaded.schema.id;
            const registered = toolRegistry.registerExtension(loaded.schema);
            if (registered) {
                discoveredToolSourcesById.set(loadedId, item.source);
                if (loadedId === id) {
                    return { tool: loaded.schema, source: item.source };
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[ext] Failed to load tool extension "${item.source}": ${message}`);
        }
    }

    return undefined;
}

// ————— Core operations —————

function describeTool(id: string): void {
    ensureToolDiscovery();
    const tool = toolRegistry.get(id);
    if (!tool) {
        throw new CliError(
            ExitCode.GENERAL,
            'TOOL_NOT_FOUND',
            `Tool "${id}" not found.`,
            'Run `siyuan tool list` to see all tools.'
        );
    }
    process.stdout.write(JSON.stringify(tool, null, 2) + '\n');
}

async function runTool(
    id: string,
    args: Record<string, unknown>,
    positional?: string
): Promise<void> {
    const resolved = await resolveToolForExecution(id);
    if (!resolved) {
        throw new CliError(
            ExitCode.GENERAL,
            'TOOL_NOT_FOUND',
            `Tool "${id}" not found.`,
            'Run `siyuan tool list` to see all tools.'
        );
    }

    const input = parsePayload({
        schema: {
            endpoint: '/tool',
            summary: resolved.tool.summary,
            payload: resolved.tool.input,
            cli: resolved.tool.cli
        } as any,
        args,
        positional
    });
    const jsonExtra = args.print === 'json' ? createJsonPrintExtra() : undefined;
    const ctx = await createToolContext(args as any, resolved.tool.id, jsonExtra);
    const result = await resolved.tool.run(ctx, input);
    if (resolved.source) {
        writeSchemaCache(resolved.source, resolved.tool);
    }
    renderToolResult(result, args as any, jsonExtra);
}

// ————— SubCommand builders —————

function buildToolSubCommand(tool: ToolSchema) {
    const payloadFields = Object.keys(tool.input.properties);
    const collision = payloadFields.filter((f) => RESERVED_CLI_ARGS.has(f));
    if (collision.length > 0) {
        throw new Error(
            `Tool "${tool.id}" payload fields conflict with reserved CLI args: ${collision.join(', ')}`
        );
    }

    return defineCommand({
        meta: { name: tool.id, description: tool.summary },
        args: {
            workspace: {
                type: 'string',
                description: 'Workspace to use',
                alias: 'w'
            },
            debug: {
                type: 'boolean',
                description: 'Debug output',
                default: false
            },
            'dry-run': {
                type: 'boolean',
                description: 'Preview without sending write request',
                default: false
            },
            yes: {
                type: 'boolean',
                description: 'Confirm write operations',
                default: false,
                alias: 'y'
            },
            print: {
                type: 'string',
                description: 'Print mode: compact | json',
                default: 'compact'
            },
            json: {
                type: 'string',
                description: 'Pass JSON input inline',
                alias: 'j'
            },
            file: {
                type: 'string',
                description: 'Load JSON input from file (- = stdin)',
                alias: 'f'
            },
            primary: {
                type: 'positional',
                description: tool.cli?.primary ?? 'Primary value',
                required: false
            },
            ...Object.fromEntries(
                Object.entries(tool.input.properties).map(([field, prop]) => [
                    field,
                    { type: 'string', description: prop.description ?? field }
                ])
            )
        },
        run: async ({ args }) => {
            await runTool(
                tool.id,
                args as Record<string, unknown>,
                args.primary as string | undefined
            ).catch((e) => fatalError(toCliError(e)));
        }
    });
}

function listTools(args: Record<string, unknown>): void {
    ensureToolDiscovery();
    const tag = args['tag'] as string | undefined;
    const cachedTools = toolRegistry
        .list({ tag })
        .map((t) => ({ id: t.id, summary: t.summary, tags: t.tags ?? [] }));

    const listedIds = new Set(cachedTools.map((t) => t.id));
    const uncachedTools = discoveredToolExtensions
        .filter(
            (item) =>
                item.cacheStatus === 'uncached' &&
                (!item.cached || !listedIds.has(item.cached.id))
        )
        .map((item) => ({
            id: item.source.replace(/^.*[\\/]/, '').replace(/\.(ts|mjs)$/i, ''),
            summary: '[uncached]',
            tags: [] as string[],
            cacheStatus: 'uncached' as const,
            source: 'extension' as const
        }));

    const staleIds = new Set(
        discoveredToolExtensions
            .filter((item) => item.cacheStatus === 'stale' && item.cached?.id)
            .map((item) => item.cached!.id)
    );

    const list = cachedTools.map((t) => ({
        ...t,
        source: toolRegistry.isExtension(t.id) ? 'extension' : 'builtin',
        ...(staleIds.has(t.id) ? { cacheStatus: 'stale' as const } : {})
    }));

    process.stdout.write(
        JSON.stringify([...list, ...uncachedTools], null, 2) + '\n'
    );

    if (uncachedTools.length > 0) {
        process.stderr.write(
            `[!] ${uncachedTools.length} uncached extension(s). Run \`siyuan extension cache\` to populate metadata.\n`
        );
    }
}

const listCommand = defineCommand({
    meta: { name: 'list', description: 'List registered tools.' },
    args: { tag: { type: 'string', description: 'Filter by tag' } },
    run: ({ args }) => listTools(args as Record<string, unknown>)
});

const describeCommand = defineCommand({
    meta: { name: 'describe', description: 'Show full ToolSchema.' },
    args: {
        id: { type: 'positional', description: 'Tool id', required: true }
    },
    run: ({ args }) => describeTool(args.id)
});

// ————— Grouped help renderer —————

export function renderGroupedToolHelp(version?: string): string {
    ensureToolDiscovery();
    const lines: string[] = [];
    const title = `Run built-in and user workflow tools. (siyuan tool${version ? ` v${version}` : ''})`;
    lines.push(colors.gray(title));
    lines.push('');
    lines.push(`${colors.underline(colors.bold('USAGE'))} ${colors.cyan('siyuan tool [OPTIONS] <command>')}`);
    lines.push('');

    const all = toolRegistry.list();
    const builtins = all.filter((t) => !toolRegistry.isExtension(t.id));
    const extensions = all.filter((t) => toolRegistry.isExtension(t.id));

    function printGroup(name: string, items: { id: string; description: string }[]) {
        if (items.length === 0) return;
        lines.push(colors.underline(colors.bold(name)));
        lines.push('');
        const maxLen = Math.max(...items.map((i) => i.id.length), 0);
        for (const item of items) {
            lines.push(`  ${item.id.padEnd(maxLen + 2)}${colors.cyan(item.description)}`);
        }
        lines.push('');
    }

    printGroup('META', [
        { id: 'list', description: 'List registered tools.' },
        { id: 'describe', description: 'Show full ToolSchema.' }
    ]);
    printGroup('BUILT-IN', builtins.map((t) => ({ id: t.id, description: t.summary })));
    printGroup('USER EXTENSIONS', extensions.map((t) => ({ id: t.id, description: t.summary })));

    lines.push(`Use ${colors.cyan('siyuan tool <command> --help')} for more information about a command.`);

    return lines.join('\n');
}

// ————— Command export —————

export function getToolHelpText(id: string): string | undefined {
    ensureToolDiscovery();
    const tool = toolRegistry.get(id);
    return tool ? buildToolHelp(tool) : undefined;
}

export const toolCommand = defineCommand({
    meta: { name: 'tool', description: 'Run built-in and user workflow tools.' },
    subCommands: () => {
        ensureToolDiscovery();
        return {
            list: listCommand,
            describe: describeCommand,
            ...Object.fromEntries(
                toolRegistry.list().map((tool) => [tool.id, buildToolSubCommand(tool)])
            )
        };
    }
});

export { buildToolHelp, ensureToolDiscovery };

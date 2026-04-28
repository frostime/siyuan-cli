import { defineCommand } from 'citty';
import { join } from 'pathe';
import { parsePayload } from '../shared/argv.js';
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
const RESERVED_TOOL_COMMANDS = new Set(['list', 'describe']);

let discoveredToolsLoaded = false;
let discoveredToolExtensions: DiscoveredExtension<ToolSchemaCache>[] = [];
const discoveredToolSourcesById = new Map<string, string>();

function warnExtensionFailure(source: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[ext] Failed to load tool extension "${source}": ${message}`);
}

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

async function resolveToolForExecution(
    id: string
): Promise<{ tool: ToolSchema; source?: string } | undefined> {
    ensureToolDiscovery();

    const cachedSource = discoveredToolSourcesById.get(id);
    if (cachedSource) {
        const loaded = await loadToolExtension(cachedSource);
        const registered = toolRegistry.registerExtension(loaded.schema);
        if (registered) {
            return { tool: loaded.schema, source: cachedSource };
        }
        const builtin = toolRegistry.get(id);
        if (builtin) {
            return { tool: builtin };
        }
    }

    const builtin = toolRegistry.get(id);
    if (builtin) {
        return { tool: builtin };
    }

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
            warnExtensionFailure(item.source, err);
        }
    }

    return undefined;
}

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
    const ctx = await createToolContext(args as any, resolved.tool.id);
    const result = await resolved.tool.run(ctx, input);
    if (resolved.source) {
        writeSchemaCache(resolved.source, resolved.tool);
    }
    renderToolResult(result, args as any);
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
            cacheStatus: 'uncached' as const
        }));

    const staleIds = new Set(
        discoveredToolExtensions
            .filter((item) => item.cacheStatus === 'stale' && item.cached?.id)
            .map((item) => item.cached!.id)
    );

    const list = cachedTools.map((t) => ({
        ...t,
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

export function getToolHelpText(id: string): string | undefined {
    ensureToolDiscovery();
    const tool = toolRegistry.get(id);
    return tool ? buildToolHelp(tool) : undefined;
}

export const toolCommand = defineCommand({
    meta: { name: 'tool', description: 'Run built-in and user workflow tools.' },
    args: {
        target: {
            type: 'positional',
            description: 'Tool id, or one of: list, describe',
            required: true
        },
        primary: {
            type: 'positional',
            description: 'Primary value or describe target',
            required: false
        },
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
        tag: {
            type: 'string',
            description: 'Filter tools by tag (for list)'
        }
    },
    run: async ({ args }) => {
        await (async () => {
            const target = String(args.target);
            if (target === 'list') {
                listTools(args as Record<string, unknown>);
                return;
            }
            if (target === 'describe') {
                if (!args.primary) {
                    throw new CliError(
                        ExitCode.GENERAL,
                        'TOOL_ID_REQUIRED',
                        'Missing tool id for `siyuan tool describe`.'
                    );
                }
                describeTool(String(args.primary));
                return;
            }
            if (RESERVED_TOOL_COMMANDS.has(target)) {
                throw new CliError(
                    ExitCode.GENERAL,
                    'TOOL_ID_RESERVED',
                    `Tool id "${target}" is reserved.`
                );
            }
            await runTool(
                target,
                args as Record<string, unknown>,
                args.primary as string | undefined
            );
        })().catch((e) => fatalError(toCliError(e)));
    }
});

export { buildToolHelp, ensureToolDiscovery };

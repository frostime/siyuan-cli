/**
 * `siyuan api` command — direct kernel API calls.
 */
import { defineCommand } from 'citty';
import { join } from 'pathe';
import { registry } from './registry.js';
import { loadConfig, materializeWorkspace, resolveEffectiveWorkspace } from '../workspace/config.js';
import { SiyuanClient } from '../shared/client.js';
import { createPermissionEngine } from '../shared/permission.js';
import { executeEndpoint } from './guard.js';
import { parsePayload } from '../shared/argv.js';
import { normalizePayloadPaths } from './msys-path.js';
import { applyFormatStrategy, preparePrintedOutput } from '../shared/output.js';
import { CliError, ExitCode, fatalError, toCliError } from '../shared/errors.js';
import { getExtensionDir } from '../workspace/paths.js';
import {
    buildEndpointSchemaFromCache,
    writeSchemaCache,
    type EndpointSchemaCache
} from '../extension/cache.js';
import {
    discoverEndpointExtensions,
    loadEndpointExtension,
    type DiscoveredExtension
} from '../extension/loader.js';
import {
    deriveEndpointId,
    type GlobalArgs,
    type RegisteredEndpoint
} from '../shared/schema.js';

import './endpoints/index.js';

const API_EXTENSION_DIR = join(getExtensionDir(), 'apis');

const RESERVED_CLI_ARGS = new Set([
    'workspace',
    'dry-run',
    'yes',
    'debug',
    'print',
    'json',
    'file',
    'primary',
    'config',
    'baseUrl',
    'token'
]);

// ————— Extension discovery —————

let discoveredEndpointsLoaded = false;
let discoveredEndpointExtensions: DiscoveredExtension<EndpointSchemaCache>[] = [];
const discoveredEndpointSourcesById = new Map<string, string>();

function out(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function ensureEndpointDiscovery(): void {
    if (discoveredEndpointsLoaded) return;
    discoveredEndpointsLoaded = true;
    discoveredEndpointExtensions = discoverEndpointExtensions(API_EXTENSION_DIR);
    for (const item of discoveredEndpointExtensions) {
        if (!item.cached) continue;
        const cachedSchema = buildEndpointSchemaFromCache(item.cached);
        const registered = registry.registerExtension(cachedSchema);
        if (registered) {
            discoveredEndpointSourcesById.set(
                deriveEndpointId(item.cached.endpoint).id,
                item.source
            );
        }
    }
}

/**
 * Resolve an endpoint for execution. If it's a user extension,
 * jiti-import the source to get real format()/filterResponse() functions.
 */
async function resolveEndpointForExecution(
    id: string
): Promise<{ entry: RegisteredEndpoint; source?: string } | undefined> {
    ensureEndpointDiscovery();

    const cachedSource = discoveredEndpointSourcesById.get(id);
    if (cachedSource) {
        try {
            const loaded = await loadEndpointExtension(cachedSource);
            registry.registerExtension(loaded.schema);
            return { entry: registry.get(id)!, source: cachedSource };
        } catch {
            // fall through to builtin lookup
        }
    }

    const builtin = registry.get(id);
    if (builtin) {
        return { entry: builtin };
    }

    // Try uncached extensions
    for (const item of discoveredEndpointExtensions) {
        if (item.cached) continue;
        try {
            const loaded = await loadEndpointExtension(item.source);
            const loadedId = deriveEndpointId(loaded.schema.endpoint).id;
            const registered = registry.registerExtension(loaded.schema);
            if (registered) {
                discoveredEndpointSourcesById.set(loadedId, item.source);
                if (loadedId === id) {
                    return { entry: registry.get(id)!, source: item.source };
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[ext] Failed to load API extension "${item.source}": ${message}`);
        }
    }

    return undefined;
}

// ————— Core operations —————

export function listEndpoints(args: Record<string, unknown>): void {
    ensureEndpointDiscovery();
    const group = args['group'] as string | undefined;
    const tag = args['tag'] as string | undefined;
    const endpoints = registry.list({ group, tag });
    const listedIds = new Set(endpoints.map((e) => e.id));
    const staleIds = new Set(
        discoveredEndpointExtensions
            .filter((item) => item.cacheStatus === 'stale' && item.cached?.endpoint)
            .map((item) => deriveEndpointId(item.cached!.endpoint).id)
    );
    const uncachedEndpoints = discoveredEndpointExtensions
        .filter((item) => item.cacheStatus === 'uncached')
        .map((item) => ({
            id: item.source.replace(/^.*[\\/]/, '').replace(/\.(ts|mjs)$/i, ''),
            endpoint: item.source.replace(/^.*[\\/]/, '').replace(/\.(ts|mjs)$/i, ''),
            summary: '[uncached]',
            cacheStatus: 'uncached' as const
        }))
        .filter((item) => !listedIds.has(item.id));

    out([
        ...endpoints.map((e) => ({
            id: e.id,
            endpoint: e.schema.endpoint,
            summary: e.schema.summary,
            tags: e.meta.tags,
            classification: e.meta.classification,
            risk: e.meta.risk,
            ...(staleIds.has(e.id) ? { cacheStatus: 'stale' as const } : {})
        })),
        ...uncachedEndpoints
    ]);

    if (uncachedEndpoints.length > 0) {
        process.stderr.write(
            `[!] ${uncachedEndpoints.length} uncached extension(s). Run \`siyuan extension cache\` to populate metadata.\n`
        );
    }
}

export function describeEndpoint(id: string): void {
    ensureEndpointDiscovery();
    const entry = registry.get(id);
    if (!entry) {
        throw new CliError(
            ExitCode.GENERAL,
            'ENDPOINT_NOT_FOUND',
            `Endpoint "${id}" not found.`,
            'Run `siyuan api list` to see all endpoints.'
        );
    }
    const { schema } = entry;
    const serializable = {
        ...schema,
        guard: schema.guard
            ? {
                  ...schema.guard,
                  ...(schema.guard.filterResponse
                      ? { filterResponse: '[Function]' }
                      : {})
              }
            : undefined,
        ...(schema.format ? { format: '[Function]' } : {})
    };
    out({ ...entry, schema: serializable });
}

export function getEndpointHelpEntry(id: string): RegisteredEndpoint | undefined {
    ensureEndpointDiscovery();
    return registry.get(id);
}

async function callEndpoint(
    entry: RegisteredEndpoint,
    rawArgs: Record<string, unknown>,
    positional?: string,
    source?: string
): Promise<void> {
    const payload = parsePayload({
        schema: entry.schema,
        args: rawArgs,
        positional
    });
    const config = loadConfig(rawArgs['config'] as string | undefined);

    const workspace = resolveEffectiveWorkspace(config, {
        workspace: rawArgs['workspace'] as string | undefined,
        baseUrl: rawArgs['baseUrl'] as string | undefined,
        token: rawArgs['token'] as string | undefined
    });
    const materialized = await materializeWorkspace(workspace);
    const client = new SiyuanClient(materialized);
    const engine = createPermissionEngine(config, workspace, client);

    const args = {
        workspace: rawArgs['workspace'] as string | undefined,
        baseUrl: rawArgs['baseUrl'] as string | undefined,
        token: rawArgs['token'] as string | undefined,
        config: rawArgs['config'] as string | undefined,
        dryRun: rawArgs['dry-run'] as boolean | undefined,
        yes: rawArgs['yes'] as boolean | undefined,
        debug: rawArgs['debug'] as boolean | undefined,
        print: (rawArgs['print'] as GlobalArgs['print'] | undefined) ?? 'compact'
    } satisfies GlobalArgs;

    normalizePayloadPaths(payload as Record<string, unknown>, entry.schema.guard?.payloadTargets);

    const result = await executeEndpoint({
        entry,
        payload,
        client,
        engine,
        config,
        workspace,
        dryRun: args.dryRun,
        yes: args.yes,
        debug: args.debug
    });
    if (source) {
        writeSchemaCache(source, entry.schema);
    }
    const rendered = preparePrintedOutput({
        print: args.print,
        details: result,
        compact: entry.schema.format
            ? () => entry.schema.format!({ endpoint: entry, payload, responseData: result, args })
            : entry.schema.formatStrategy
                ? () => applyFormatStrategy(entry.schema.formatStrategy!, result)
                : undefined,
        warning: { endpoint: entry.id }
    });
    if (rendered.warning) {
        process.stderr.write(JSON.stringify(rendered.warning) + '\n');
    }
    process.stdout.write(rendered.stdout + '\n');
}

// ————— SubCommand builders —————

function buildEndpointSubCommand(entry: RegisteredEndpoint) {
    const payloadFields = Object.keys(entry.schema.payload.properties);
    // Skip collision check for multipart endpoints: their file fields are intentionally
    // named after what they upload and --file (load JSON payload) doesn't apply to them anyway.
    if (!entry.schema.multipart) {
        const skipFields = new Set(entry.schema.cli?.skipFields ?? []);
        const collision = payloadFields.filter(
            (f) => RESERVED_CLI_ARGS.has(f) && !skipFields.has(f)
        );
        if (collision.length > 0) {
            throw new Error(
                `Endpoint "${entry.id}" payload fields conflict with reserved CLI args: ${collision.join(', ')}`
            );
        }
    }
    return defineCommand({
        meta: { name: entry.id, description: entry.schema.summary },
        args: {
            workspace: {
                type: 'string',
                description: 'Workspace to use',
                alias: 'w'
            },
            'dry-run': {
                type: 'boolean',
                description: 'Preview request without sending',
                default: false
            },
            yes: {
                type: 'boolean',
                description: 'Confirm write operations',
                default: false,
                alias: 'y'
            },
            debug: {
                type: 'boolean',
                description: 'Show debug info (curl equivalent)',
                default: false
            },
            print: {
                type: 'string',
                description: 'Print mode: compact | json',
                default: 'compact'
            },
            json: {
                type: 'string',
                description: 'Pass JSON payload inline',
                alias: 'j'
            },
            file: {
                type: 'string',
                description: 'Load JSON payload from file (- = stdin)',
                alias: 'f'
            },
            primary: {
                type: 'positional',
                description: entry.schema.cli?.primary
                    ? `Primary value for ${entry.schema.cli.primary}`
                    : 'Primary value',
                required: false
            },
            ...Object.fromEntries(
                Object.entries(entry.schema.payload.properties)
                    .filter(
                        ([field]) =>
                            !(entry.schema.cli?.skipFields ?? []).includes(
                                field
                            )
                    )
                    .map(([field, prop]) => [
                        field,
                        {
                            type: 'string',
                            description: prop.description ?? field
                        }
                    ])
            )
        },
        run: async ({ args }) => {
            const resolved = await resolveEndpointForExecution(entry.id);
            const target = resolved ?? { entry };
            await callEndpoint(
                target.entry,
                args as Record<string, unknown>,
                args.primary as string | undefined,
                target.source
            ).catch((e) => fatalError(toCliError(e)));
        }
    });
}

const listCommand = defineCommand({
    meta: { name: 'list', description: 'List all registered API endpoints.' },
    args: {
        group: {
            type: 'string',
            description: 'Filter by group (e.g. query, block)'
        },
        tag: {
            type: 'string',
            description: 'Filter by tag (mode:read, surface:content, ...)'
        }
    },
    run: ({ args }) => listEndpoints(args as Record<string, unknown>)
});

const describeCommand = defineCommand({
    meta: {
        name: 'describe',
        description: 'Show full EndpointSchema for an endpoint.'
    },
    args: {
        id: {
            type: 'positional',
            description: 'Endpoint id (e.g. query.sql)',
            required: true
        }
    },
    run: ({ args }) => describeEndpoint(args.id)
});

// ————— Command export —————

export const apiCommand = defineCommand({
    meta: {
        name: 'api',
        description: 'Call SiYuan kernel API endpoints directly.'
    },
    subCommands: () => {
        ensureEndpointDiscovery();
        return {
            list: listCommand,
            describe: describeCommand,
            ...Object.fromEntries(
                registry.list().map((entry) => [entry.id, buildEndpointSubCommand(entry)])
            )
        };
    }
});

export { ensureEndpointDiscovery };

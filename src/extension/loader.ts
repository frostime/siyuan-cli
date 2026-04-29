import { existsSync, readdirSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'pathe';
import { createJiti, type Jiti } from 'jiti';
import type { EndpointSchema, ToolSchema } from '../shared/schema.js';
import {
    type CacheStatus,
    type EndpointSchemaCache,
    type ToolSchemaCache,
    readSchemaCache
} from './cache.js';

let jitiInstance: Jiti | undefined;

function getJiti(): Jiti {
    if (!jitiInstance) {
        jitiInstance = createJiti(import.meta.url);
    }
    return jitiInstance;
}

export interface DiscoveredExtension<T> {
    source: string;
    cacheStatus: CacheStatus;
    cached?: T;
}

export interface LoadedExtension<T> {
    source: string;
    schema: T;
}

function scanExtensionSources(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => {
            const lower = name.toLowerCase();
            if (lower.endsWith('.d.ts')) return false;
            if (lower.endsWith('.schema.json')) return false;
            if (lower.endsWith('.test.ts')) return false;
            return lower.endsWith('.ts') || lower.endsWith('.mjs');
        })
        .map((name) => join(dir, name))
        .sort((a, b) => a.localeCompare(b));
}

function discoverExtensions<T>(dir: string): DiscoveredExtension<T>[] {
    return scanExtensionSources(dir).map((source) => {
        const cached = readSchemaCache<T>(source);
        return {
            source,
            cacheStatus: cached.status,
            ...(cached.data ? { cached: cached.data } : {})
        } satisfies DiscoveredExtension<T>;
    });
}

async function importExtensionModule(source: string): Promise<unknown> {
    const absSource = isAbsolute(source) ? source : resolve(source);
    const extension = extname(absSource).toLowerCase();
    if (extension === '.mjs') {
        return import(absSource);
    }
    return getJiti().import(absSource);
}

export function validateToolExport(mod: unknown, source: string): ToolSchema {
    const tool =
        mod && typeof mod === 'object'
            ? (mod as Record<string, unknown>)['tool']
            : undefined;
    if (!tool || typeof tool !== 'object') {
        throw new Error(
            `[ext] Invalid tool extension "${source}": missing export \`tool\`.`
        );
    }
    const candidate = tool as Record<string, unknown>;
    if (typeof candidate['id'] !== 'string' || !candidate['id']) {
        throw new Error(
            `[ext] Invalid tool extension "${source}": tool.id must be a non-empty string.`
        );
    }
    if (typeof candidate['run'] !== 'function') {
        throw new Error(
            `[ext] Invalid tool extension "${source}": tool.run must be a function.`
        );
    }
    if (!candidate['input'] || typeof candidate['input'] !== 'object') {
        throw new Error(
            `[ext] Invalid tool extension "${source}": tool.input must be an object.`
        );
    }
    return tool as ToolSchema;
}

export function validateEndpointExport(
    mod: unknown,
    source: string
): EndpointSchema {
    const schema =
        mod && typeof mod === 'object'
            ? (mod as Record<string, unknown>)['schema']
            : undefined;
    if (!schema || typeof schema !== 'object') {
        throw new Error(
            `[ext] Invalid API extension "${source}": missing export \`schema\`.`
        );
    }
    const candidate = schema as Record<string, unknown>;
    if (typeof candidate['endpoint'] !== 'string' || !candidate['endpoint']) {
        throw new Error(
            `[ext] Invalid API extension "${source}": schema.endpoint must be a non-empty string.`
        );
    }
    if (
        !candidate['classification'] ||
        typeof candidate['classification'] !== 'object'
    ) {
        throw new Error(
            `[ext] Invalid API extension "${source}": schema.classification must be an object.`
        );
    }
    if (!candidate['payload'] || typeof candidate['payload'] !== 'object') {
        throw new Error(
            `[ext] Invalid API extension "${source}": schema.payload must be an object.`
        );
    }
    return schema as EndpointSchema;
}

export function discoverToolExtensions(
    extDir: string
): DiscoveredExtension<ToolSchemaCache>[] {
    return discoverExtensions<ToolSchemaCache>(extDir);
}

export function discoverEndpointExtensions(
    extDir: string
): DiscoveredExtension<EndpointSchemaCache>[] {
    return discoverExtensions<EndpointSchemaCache>(extDir);
}

export async function loadToolExtension(
    source: string
): Promise<LoadedExtension<ToolSchema>> {
    const mod = await importExtensionModule(source);
    return {
        source,
        schema: validateToolExport(mod, source)
    };
}

export async function loadEndpointExtension(
    source: string
): Promise<LoadedExtension<EndpointSchema>> {
    const mod = await importExtensionModule(source);
    return {
        source,
        schema: validateEndpointExport(mod, source)
    };
}

export async function loadAllToolExtensions(
    extDir: string
): Promise<LoadedExtension<ToolSchema>[]> {
    const loaded: LoadedExtension<ToolSchema>[] = [];
    for (const source of scanExtensionSources(extDir)) {
        try {
            loaded.push(await loadToolExtension(source));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(
                `[ext] Failed to load tool extension "${source}": ${message}`
            );
        }
    }
    return loaded;
}

export async function loadAllEndpointExtensions(
    extDir: string
): Promise<LoadedExtension<EndpointSchema>[]> {
    const loaded: LoadedExtension<EndpointSchema>[] = [];
    for (const source of scanExtensionSources(extDir)) {
        try {
            loaded.push(await loadEndpointExtension(source));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(
                `[ext] Failed to load API extension "${source}": ${message}`
            );
        }
    }
    return loaded;
}

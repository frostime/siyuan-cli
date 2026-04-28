import {
    existsSync,
    readFileSync,
    statSync,
    writeFileSync
} from 'node:fs';
import { basename } from 'pathe';
import type {
    CliBehavior,
    EndpointClassification,
    EndpointSchema,
    FormatStrategy,
    JSONSchema,
    JSONSchemaProperty,
    PayloadTargetSpec,
    ToolSchema,
    ToolTag
} from '../shared/schema.js';

export const CACHE_VERSION = 1;

export interface SchemaCacheEnvelope<T> {
    _version: number;
    _meta: {
        sourceFile: string;
        cachedAt: string;
    };
    data: T;
}

export interface ToolSchemaCache {
    id: string;
    summary: string;
    description?: string;
    tags?: ToolTag[];
    input: JSONSchema;
    output?: JSONSchemaProperty;
    cli?: CliBehavior;
}

export interface EndpointSchemaCache {
    endpoint: string;
    summary: string;
    description?: string;
    payload: JSONSchema;
    classification: EndpointClassification;
    guard?: {
        payloadTargets?: PayloadTargetSpec[];
        response?: {
            itemsAt: string;
            fieldMap: Record<string, string>;
        };
    };
    cli?: CliBehavior;
    formatStrategy?: FormatStrategy;
    multipart?: { fileFields: string[] };
}

export type CacheStatus = 'cached' | 'stale' | 'uncached';

export interface ReadSchemaCacheResult<T> {
    status: CacheStatus;
    cachePath: string;
    envelope?: SchemaCacheEnvelope<T>;
    data?: T;
}

export function getSchemaCachePath(source: string): string {
    return source.replace(/\.(ts|mjs)$/i, '.schema.json');
}

export function extractToolCacheData(tool: ToolSchema): ToolSchemaCache {
    return {
        id: tool.id,
        summary: tool.summary,
        ...(tool.description ? { description: tool.description } : {}),
        ...(tool.tags ? { tags: [...tool.tags] } : {}),
        input: tool.input,
        ...(tool.output ? { output: tool.output } : {}),
        ...(tool.cli ? { cli: tool.cli } : {})
    };
}

export function extractEndpointCacheData(
    schema: EndpointSchema
): EndpointSchemaCache {
    return {
        endpoint: schema.endpoint,
        summary: schema.summary,
        ...(schema.description ? { description: schema.description } : {}),
        payload: schema.payload,
        classification: schema.classification,
        ...(schema.guard
            ? {
                  guard: {
                      ...(schema.guard.payloadTargets
                          ? { payloadTargets: schema.guard.payloadTargets }
                          : {}),
                      ...(schema.guard.response
                          ? {
                                response: {
                                    itemsAt: schema.guard.response.itemsAt,
                                    fieldMap: Object.fromEntries(
                                        Object.entries(
                                            schema.guard.response.fieldMap
                                        ).filter(([, value]) => Boolean(value))
                                    ) as Record<string, string>
                                }
                            }
                          : {})
                  }
              }
            : {}),
        ...(schema.cli ? { cli: schema.cli } : {}),
        ...(schema.formatStrategy
            ? { formatStrategy: schema.formatStrategy }
            : {}),
        ...(schema.multipart ? { multipart: schema.multipart } : {})
    };
}

export function writeSchemaCache(
    source: string,
    schema: ToolSchema | EndpointSchema
): string | undefined {
    const cachePath = getSchemaCachePath(source);
    try {
        const data = 'run' in schema
            ? extractToolCacheData(schema)
            : extractEndpointCacheData(schema);
        const envelope: SchemaCacheEnvelope<typeof data> = {
            _version: CACHE_VERSION,
            _meta: {
                sourceFile: basename(source),
                cachedAt: new Date().toISOString()
            },
            data
        };
        writeFileSync(cachePath, JSON.stringify(envelope, null, 2), 'utf-8');
        return cachePath;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
            `[ext] Failed to write cache for "${source}": ${message}`
        );
        return undefined;
    }
}

export function readSchemaCache<T>(source: string): ReadSchemaCacheResult<T> {
    const cachePath = getSchemaCachePath(source);
    if (!existsSync(cachePath)) {
        return { status: 'uncached', cachePath };
    }

    let envelope: SchemaCacheEnvelope<T>;
    try {
        envelope = JSON.parse(readFileSync(cachePath, 'utf-8')) as SchemaCacheEnvelope<T>;
    } catch {
        return { status: 'uncached', cachePath };
    }

    let status: CacheStatus = 'cached';
    if (envelope._version !== CACHE_VERSION) {
        status = 'stale';
    } else {
        try {
            const sourceMtime = statSync(source).mtimeMs;
            const cacheMtime = statSync(cachePath).mtimeMs;
            if (sourceMtime > cacheMtime) {
                status = 'stale';
            }
        } catch {
            status = 'stale';
        }
    }

    return {
        status,
        cachePath,
        envelope,
        data: envelope.data
    };
}

export function buildToolSchemaFromCache(cache: ToolSchemaCache): ToolSchema {
    return {
        id: cache.id,
        summary: cache.summary,
        ...(cache.description ? { description: cache.description } : {}),
        ...(cache.tags ? { tags: cache.tags } : {}),
        input: cache.input,
        ...(cache.output ? { output: cache.output } : {}),
        ...(cache.cli ? { cli: cache.cli } : {}),
        async run() {
            throw new Error(
                `Tool extension "${cache.id}" was registered from cache only.`
            );
        }
    };
}

export function buildEndpointSchemaFromCache(
    cache: EndpointSchemaCache
): EndpointSchema {
    return {
        endpoint: cache.endpoint,
        summary: cache.summary,
        ...(cache.description ? { description: cache.description } : {}),
        payload: cache.payload,
        classification: cache.classification,
        ...(cache.guard ? { guard: cache.guard } : {}),
        ...(cache.cli ? { cli: cache.cli } : {}),
        ...(cache.formatStrategy
            ? { formatStrategy: cache.formatStrategy }
            : {}),
        ...(cache.multipart ? { multipart: cache.multipart } : {})
    };
}

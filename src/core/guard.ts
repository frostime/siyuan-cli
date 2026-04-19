/**
 * Schema guard execution — payload checking + response filtering.
 */
import {
    deriveEndpointId,
    evaluatePointerPath,
    runPointerFilterTerminal,
    type EndpointSchema,
    type PermissionEngineLike,
    type RegisteredEndpoint
} from './schema.js';
import {
    ConfirmationRequiredError,
    ContentAccessDeniedError,
    type PermissionEngine
} from './permission.js';
import type { SiyuanClient } from './client.js';

export async function applyPayloadGuard(
    schema: EndpointSchema,
    payload: unknown,
    engine: PermissionEngineLike,
    access: 'read' | 'write',
    surface?: 'meta' | 'content' | 'asset' | 'workspace' | 'runtime' | 'network'
): Promise<void> {
    const p = payload as Record<string, unknown>;
    const targets = schema.guard?.payloadTargets;
    if (targets?.length) {
        for (const target of targets) {
            let values: unknown[];
            try {
                values = evaluatePointerPath(payload, target.path);
            } catch (error) {
                throw new ContentAccessDeniedError((error as Error).message);
            }
            for (const value of values) {
                if (typeof value !== 'string') {
                    throw new ContentAccessDeniedError(
                        `payload path "${target.path}" must resolve to string values`
                    );
                }
                await engine.checkContentRef({
                    kind: target.kind,
                    value,
                    access: target.access
                });
            }
        }
        return;
    }
}

/**
 * Response guards operate on the unwrapped `data` returned by SiyuanClient.
 * They do not see the raw kernel envelope `{ code, msg, data }`.
 */
export function applyResponseGuard(
    schema: EndpointSchema,
    response: unknown,
    engine: PermissionEngineLike
): unknown {
    const guard = schema.guard;
    if (!guard) return response;
    if (guard.filterResponse) {
        return guard.filterResponse(response, engine);
    }
    if (guard.response) {
        const { itemsAt, fieldMap } = guard.response;
        const items = evaluatePointerPath(response, itemsAt);
        const { kept, removed, reasons } = engine.filterItems(items, (item) => {
            const i = item as Record<string, unknown>;
            return {
                id: fieldMap.id
                    ? (i[fieldMap.id] as string | undefined)
                    : undefined,
                path: fieldMap.path
                    ? (i[fieldMap.path] as string | undefined)
                    : undefined,
                notebook: fieldMap.notebook
                    ? (i[fieldMap.notebook] as string | undefined)
                    : undefined
            };
        });
        if (removed > 0) {
            const summary = Object.entries(reasons)
                .map(([r, n]) => `${n}x: ${r}`)
                .join('; ');
            process.stderr.write(
                JSON.stringify({
                    warning: 'CONTENT_FILTERED',
                    removed,
                    reasons: summary
                }) + '\n'
            );
            return runPointerFilterTerminal(response, itemsAt, () => kept);
        }
    }
    return response;
}

export interface ExecuteOptions {
    entry: RegisteredEndpoint;
    payload: unknown;
    client: SiyuanClient;
    engine: PermissionEngine;
    dryRun?: boolean;
    yes?: boolean;
    debug?: boolean;
}

function debugPreview(schema: EndpointSchema, payload: unknown): void {
    const body = JSON.stringify(payload);
    const curl = `curl -X POST <baseUrl>${schema.endpoint} -H "Content-Type: application/json" --data ${JSON.stringify(body)}`;
    process.stderr.write(
        JSON.stringify({
            debug: { endpoint: schema.endpoint, payload, curl }
        }) + '\n'
    );
}

function isWriteLike(entry: RegisteredEndpoint): boolean {
    return (
        entry.meta.classification.mode === 'write' ||
        entry.meta.classification.mode === 'invoke'
    );
}

export async function executeEndpoint(opts: ExecuteOptions): Promise<unknown> {
    const { entry, payload, client, engine, dryRun, yes, debug } = opts;
    const { schema } = entry;
    const { id } = deriveEndpointId(schema.endpoint);

    engine.checkEndpoint(id);
    await applyPayloadGuard(
        schema,
        payload,
        engine,
        entry.meta.classification.mode === 'read' ? 'read' : 'write',
        entry.meta.classification.surface
    );

    if (debug) debugPreview(schema, payload);
    if (dryRun && isWriteLike(entry)) {
        return { dryRun: true, endpoint: schema.endpoint, payload };
    }

    if (engine.requiresConfirmation(entry) && !yes) {
        throw new ConfirmationRequiredError(id);
    }

    let response: unknown;
    if (schema.multipart) {
        const files = (schema.multipart.fileFields || []).flatMap((field) => {
            const val = (payload as Record<string, unknown>)[field];
            const paths = Array.isArray(val) ? val : [val];
            return (paths as string[]).map((p) => ({ field, path: p }));
        });
        const fields: Record<string, string> = {};
        for (const [k, v] of Object.entries(
            payload as Record<string, unknown>
        )) {
            if (
                !schema.multipart.fileFields.includes(k) &&
                typeof v === 'string'
            ) {
                fields[k] = v;
            }
        }
        response = await client.upload(schema.endpoint, files, fields);
    } else {
        response = await client.call(schema.endpoint, payload);
    }

    return applyResponseGuard(schema, response, engine);
}

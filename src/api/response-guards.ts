import type { CallerContext, PermissionEngineLike } from '@/shared/schema.js';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function filterIdKeyedMap<T>(
    response: Record<string, T>,
    engine: PermissionEngineLike,
    caller?: CallerContext
): Promise<Record<string, T>> {
    const entries = Object.entries(response).map(([id, value]) => ({ id, value }));
    const { kept } = await engine.filterItems(
        entries,
        (entry) => ({ id: entry.id }),
        caller,
        'read'
    );
    return Object.fromEntries(kept.map((entry) => [entry.id, entry.value]));
}

export async function filterObjectById<T extends Record<string, unknown>>(
    response: T,
    engine: PermissionEngineLike,
    caller?: CallerContext,
    idField = 'id'
): Promise<T | null> {
    const id = response[idField];
    if (typeof id !== 'string' || id === '') return response;
    const { kept } = await engine.filterItems(
        [response],
        (item) => ({ id: item[idField] as string }),
        caller,
        'read'
    );
    return kept[0] ?? null;
}

export async function filterResponseObjectById(
    response: unknown,
    engine: PermissionEngineLike,
    caller?: CallerContext,
    idField = 'id'
): Promise<unknown> {
    if (!isObjectRecord(response)) return response;
    return await filterObjectById(response, engine, caller, idField);
}

export async function filterSiblingIdFields(
    response: unknown,
    engine: PermissionEngineLike,
    caller?: CallerContext
): Promise<unknown> {
    if (!isObjectRecord(response)) return response;
    const keys = ['parent', 'previous', 'next'] as const;
    const refs = keys
        .map((key) => ({ key, id: response[key] }))
        .filter((entry): entry is { key: (typeof keys)[number]; id: string } =>
            typeof entry.id === 'string' && entry.id !== ''
        );
    const { kept } = await engine.filterItems(
        refs,
        (entry) => ({ id: entry.id }),
        caller,
        'read'
    );
    const allowed = new Set(kept.map((entry) => entry.key));
    const out = { ...response };
    for (const ref of refs) {
        if (!allowed.has(ref.key)) out[ref.key] = '';
    }
    return out;
}

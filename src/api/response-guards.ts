import type { PermissionEngineLike, ResponseFilterContext } from '@/shared/schema.js';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emitContentFiltered(
    context: ResponseFilterContext | undefined,
    removed: number,
    reasons: Record<string, number>
): void {
    if (removed <= 0) return;
    const summary = Object.entries(reasons)
        .map(([reason, count]) => `${count}x: ${reason}`)
        .join('; ');
    context?.emitWarning?.({
        warning: 'CONTENT_FILTERED',
        removed,
        reasons: summary
    });
}

export async function filterIdKeyedMap<T>(
    response: Record<string, T>,
    engine: PermissionEngineLike,
    context?: ResponseFilterContext
): Promise<Record<string, T>> {
    const entries = Object.entries(response).map(([id, value]) => ({ id, value }));
    const { kept, removed, reasons } = await engine.filterItems(
        entries,
        (entry) => ({ id: entry.id }),
        context?.caller,
        'read'
    );
    emitContentFiltered(context, removed, reasons);
    return Object.fromEntries(kept.map((entry) => [entry.id, entry.value]));
}

export async function filterObjectById<T extends Record<string, unknown>>(
    response: T,
    engine: PermissionEngineLike,
    context?: ResponseFilterContext,
    idField = 'id'
): Promise<T | null> {
    const id = response[idField];
    if (typeof id !== 'string' || id === '') return response;
    const { kept, removed, reasons } = await engine.filterItems(
        [response],
        (item) => ({ id: item[idField] as string }),
        context?.caller,
        'read'
    );
    emitContentFiltered(context, removed, reasons);
    return kept[0] ?? null;
}

export async function filterResponseObjectById(
    response: unknown,
    engine: PermissionEngineLike,
    context?: ResponseFilterContext,
    idField = 'id'
): Promise<unknown> {
    if (!isObjectRecord(response)) return response;
    return await filterObjectById(response, engine, context, idField);
}

export async function filterSiblingIdFields(
    response: unknown,
    engine: PermissionEngineLike,
    context?: ResponseFilterContext
): Promise<unknown> {
    if (!isObjectRecord(response)) return response;
    const keys = ['parent', 'previous', 'next'] as const;
    const refs = keys
        .map((key) => ({ key, id: response[key] }))
        .filter((entry): entry is { key: (typeof keys)[number]; id: string } =>
            typeof entry.id === 'string' && entry.id !== ''
        );
    const { kept, removed, reasons } = await engine.filterItems(
        refs,
        (entry) => ({ id: entry.id }),
        context?.caller,
        'read'
    );
    emitContentFiltered(context, removed, reasons);
    const allowed = new Set(kept.map((entry) => entry.key));
    const out = { ...response };
    for (const ref of refs) {
        if (!allowed.has(ref.key)) out[ref.key] = '';
    }
    return out;
}

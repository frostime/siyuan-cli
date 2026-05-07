import type { FormatStrategy, GlobalArgs } from './schema.js';

export interface JsonPrintExtra {
    warnings: unknown[];
    notices: unknown[];
    approvals: unknown[];
    debug: unknown[];
    meta?: Record<string, unknown>;
}

export interface JsonPrintEnvelope {
    ok: true;
    data: unknown;
    extra: JsonPrintExtra;
}

export interface PreparedPrintOutput {
    stdout: string;
}

export interface PreparePrintOptions {
    print?: GlobalArgs['print'];
    details: unknown;
    compact?: string | (() => string);
    jsonExtra?: JsonPrintExtra;
}

export function jsonStringify(value: unknown): string {
    return JSON.stringify(value ?? null, null, 2);
}

export function createJsonPrintExtra(): JsonPrintExtra {
    return {
        warnings: [],
        notices: [],
        approvals: [],
        debug: []
    };
}

export function preparePrintedOutput(
    opts: PreparePrintOptions
): PreparedPrintOutput {
    if (opts.print === 'json') {
        const envelope: JsonPrintEnvelope = {
            ok: true,
            data: opts.details ?? null,
            extra: opts.jsonExtra ?? createJsonPrintExtra()
        };
        return { stdout: jsonStringify(envelope) };
    }
    if (opts.compact === undefined) {
        return { stdout: jsonStringify(opts.details) };
    }

    const rendered =
        typeof opts.compact === 'function' ? opts.compact() : opts.compact;
    if (typeof rendered !== 'string') {
        throw new Error('Compact renderer must return a string.');
    }
    return { stdout: rendered };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Formatting utilities (Agent-oriented: lossless, token-efficient)
// ---------------------------------------------------------------------------

/**
 * Render a single-line value. Strings are kept intact (no truncation).
 * Numbers, booleans, null, undefined are stringified.
 * Objects/arrays are JSON-serialized.
 */
export function inlineValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
    ) {
        return String(value);
    }
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    return JSON.stringify(value);
}

/**
 * Format a single record as `key=value | key=value`.
 * No truncation — keeps values intact for Agent consumption.
 */
export function formatInlineRecord(
    record: Record<string, unknown>,
    opts?: { keys?: string[] }
): string {
    const keys = (opts?.keys ?? Object.keys(record)).filter(
        (key) => record[key] !== undefined
    );
    return keys.map((key) => `${key}=${inlineValue(record[key])}`).join(' | ');
}

// ---------------------------------------------------------------------------
// formatRecords — table/section dual-mode with page chunking
// ---------------------------------------------------------------------------

export interface FormatRecordsOptions {
    /** Column keys to display; omit = all keys from first record */
    keys?: string[];
    /** Items per page; default 50. Set to 0 or Infinity to disable chunking */
    pageSize?: number;
    /** Label for the collection, e.g. 'rows', 'hits', 'entries' */
    label?: string;
    /**
     * Format mode:
     * - 'auto' (default): use section if any value contains `\n`, else table
     * - 'table': force single-line tabular layout
     * - 'section': force section-per-item layout
     */
    mode?: 'auto' | 'table' | 'section';
}

/** Detect if any record value contains a newline */
function hasMultilineValue(
    items: Record<string, unknown>[],
    keys: string[]
): boolean {
    return items.some((item) =>
        keys.some((k) => typeof item[k] === 'string' && (item[k] as string).includes('\n'))
    );
}

/** Format records in table mode: header + value rows, paged */
function formatTable(
    items: Record<string, unknown>[],
    keys: string[],
    label: string,
    pageSize: number
): string {
    const total = items.length;
    const totalPages = pageSize > 0 && pageSize < total ? Math.ceil(total / pageSize) : 1;

    const pages: string[] = [];
    for (let page = 0; page < totalPages; page++) {
        const start = page * pageSize;
        const end = totalPages > 1 ? Math.min(start + pageSize, total) : total;
        const slice = totalPages > 1 ? items.slice(start, end) : items;

        const header = total === slice.length
            ? `${total} ${label} [${keys.join(', ')}]`
            : `${total} ${label} [${keys.join(', ')}] — page ${page + 1}/${totalPages} (${start + 1}-${end})`;

        const rows = slice.map((item, i) => {
            const num = start + i + 1;
            const vals = keys.map((k) => item[k] === undefined ? '' : inlineValue(item[k]));
            return `${num}: ${vals.join(' | ')}`;
        });

        pages.push([header, ...rows].join('\n'));
    }
    return pages.join('\n\n');
}

/** Format records in section mode: one block per item, paged */
function formatSection(
    items: Record<string, unknown>[],
    keys: string[],
    label: string,
    pageSize: number
): string {
    const total = items.length;
    const totalPages = pageSize > 0 && pageSize < total ? Math.ceil(total / pageSize) : 1;

    const pages: string[] = [];
    for (let page = 0; page < totalPages; page++) {
        const start = page * pageSize;
        const end = totalPages > 1 ? Math.min(start + pageSize, total) : total;
        const slice = totalPages > 1 ? items.slice(start, end) : items;

        const pageHeader = totalPages > 1
            ? `${total} ${label} — page ${page + 1}/${totalPages} (${start + 1}-${end})`
            : `${total} ${label}`;

        const blocks = slice.map((item, i) => {
            const num = start + i + 1;
            const lines: string[] = [`=== item ${num}/${total} ===`];
            for (const k of keys) {
                const val = item[k];
                if (val === undefined) continue;
                if (typeof val === 'string' && val.includes('\n')) {
                    const indented = val
                        .split('\n')
                        .map((l, li) => (li === 0 ? `  ${l}` : `  ${l}`))
                        .join('\n');
                    lines.push(`${k}:`);
                    lines.push(indented);
                } else {
                    lines.push(`${k}: ${inlineValue(val)}`);
                }
            }
            return lines.join('\n');
        });

        pages.push([pageHeader, ...blocks].join('\n'));
    }
    return pages.join('\n\n');
}

/**
 * Format an array of records for Agent consumption.
 * - Lossless: no truncation of rows or values
 * - Token-efficient: keys written once in header (table) or per-item (section)
 * - Auto-detects multiline values to choose table vs section layout
 * - Page-chunked to prevent LLM context overload
 */
export function formatRecords(
    items: unknown[],
    opts?: FormatRecordsOptions
): string {
    const label = opts?.label ?? 'items';
    if (items.length === 0) return `0 ${label}`;

    const records = items.map((item, i) => {
        if (!isRecord(item)) {
            throw new Error(`formatRecords: item ${i} is not a record`);
        }
        return item;
    });

    const keys = opts?.keys ?? (records.length > 0 ? Object.keys(records[0]!) : []);
    const mode = opts?.mode ?? 'auto';
    const pageSize = opts?.pageSize ?? 50;

    const effectivePageSize = pageSize === 0 ? Infinity : pageSize;

    const useSection =
        mode === 'section' ||
        (mode === 'auto' && hasMultilineValue(records, keys));

    if (useSection) {
        return formatSection(records, keys, label, effectivePageSize === Infinity ? records.length : effectivePageSize as number);
    }
    return formatTable(records, keys, label, effectivePageSize === Infinity ? records.length : effectivePageSize as number);
}

// ---------------------------------------------------------------------------
// FormatStrategy renderers — schema-level pre-built compact formats
// ---------------------------------------------------------------------------

/** `direct`: scalar values → string. Arrays join with newlines. */
export function formatDirect(data: unknown): string {
    if (Array.isArray(data)) return data.map(String).join('\n');
    return String(data ?? 'null');
}

/**
 * `records`: auto-detect array location and render as table.
 * - Top-level array → use directly
 * - Object with array-valued key → use first such array
 */
export function formatRecordsStrategy(data: unknown): string {
    const { array, label } = findTopArray(data);
    if (array.length === 0) return jsonStringify(data);
    return formatRecords(array, { label });
}

function findTopArray(data: unknown): { array: unknown[]; label: string } {
    if (Array.isArray(data)) return { array: data, label: 'items' };
    if (isRecord(data)) {
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) return { array: value, label: key };
        }
    }
    return { array: [], label: 'items' };
}

/**
 * `transaction`: write operation results → `OK | ids=... | ops=...`.
 * Handles array of `{ doOperations }` objects, or void-like responses.
 */
export function formatTransaction(data: unknown): string {
    if (data === null || data === undefined) return 'OK';
    if (!Array.isArray(data) || data.length === 0) return 'OK';

    const txs = data as Array<{
        doOperations?: Array<{ action: string; id?: string }>;
    }>;

    const ids: string[] = [];
    const actions: string[] = [];
    for (const tx of txs) {
        for (const op of tx.doOperations ?? []) {
            if (op.id) ids.push(op.id);
            if (op.action) actions.push(op.action);
        }
    }

    const parts = ['OK'];
    if (ids.length > 0) parts.push(`ids=${ids.join(',')}`);
    if (actions.length > 0) {
        const counts = actions.reduce(
            (acc, a) => {
                acc[a] = (acc[a] ?? 0) + 1;
                return acc;
            },
            {} as Record<string, number>
        );
        parts.push(
            `ops=${Object.entries(counts)
                .map(([k, v]) => `${k}×${v}`)
                .join(',')}`
        );
    }
    return parts.join(' | ');
}

/**
 * `object`: single record → inline `k=v | k=v`, or section mode for multiline values.
 */
export function formatObject(data: unknown): string {
    if (!isRecord(data)) return jsonStringify(data);

    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';

    const hasMultiline = entries.some(
        ([, v]) => typeof v === 'string' && v.includes('\n')
    );

    if (!hasMultiline) {
        return entries.map(([k, v]) => `${k}=${inlineValue(v)}`).join(' | ');
    }

    return entries
        .map(([k, v]) => {
            if (typeof v === 'string' && v.includes('\n')) {
                const lines = v
                    .split('\n')
                    .map((l) => `  ${l}`)
                    .join('\n');
                return `${k}:\n${lines}`;
            }
            return `${k}: ${inlineValue(v)}`;
        })
        .join('\n');
}

/** `json`: explicit JSON output. */
export function formatJson(data: unknown): string {
    return jsonStringify(data);
}

/**
 * Dispatch to the appropriate strategy renderer.
 * Guard-free: format and guard are fully decoupled.
 */
export function applyFormatStrategy(
    strategy: FormatStrategy,
    data: unknown
): string {
    switch (strategy) {
        case 'direct':
            return formatDirect(data);
        case 'records':
            return formatRecordsStrategy(data);
        case 'transaction':
            return formatTransaction(data);
        case 'object':
            return formatObject(data);
        case 'json':
            return formatJson(data);
    }
}

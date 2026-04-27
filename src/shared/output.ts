import type { GlobalArgs } from './schema.js';

export interface PreparedPrintOutput {
    stdout: string;
    warning?: Record<string, unknown>;
}

export interface PreparePrintOptions {
    print?: GlobalArgs['print'];
    details: unknown;
    compact?: string | (() => string);
    warning?: Record<string, unknown>;
}

export function jsonStringify(value: unknown): string {
    return JSON.stringify(value ?? null, null, 2);
}

export function preparePrintedOutput(
    opts: PreparePrintOptions
): PreparedPrintOutput {
    if (opts.print === 'json') {
        return { stdout: jsonStringify(opts.details) };
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

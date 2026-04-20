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
    const json = jsonStringify(opts.details);
    if (opts.print === 'json') {
        return { stdout: json };
    }
    if (opts.compact === undefined) {
        return { stdout: json };
    }

    try {
        const rendered =
            typeof opts.compact === 'function' ? opts.compact() : opts.compact;
        if (typeof rendered !== 'string') {
            throw new Error('Compact renderer must return a string.');
        }
        return { stdout: rendered };
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return {
            stdout: json,
            warning: {
                warning: 'COMPACT_RENDER_FAILED',
                ...(opts.warning ?? {}),
                message: err.message
            }
        };
    }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function truncateInline(value: string, limit = 120): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= limit) return singleLine;
    return `${singleLine.slice(0, Math.max(0, limit - 3))}...`;
}

export function inlineValue(value: unknown, limit = 120): string {
    if (typeof value === 'string') return truncateInline(value, limit);
    if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
    ) {
        return String(value);
    }
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    return truncateInline(JSON.stringify(value), limit);
}

export function formatInlineRecord(
    record: Record<string, unknown>,
    opts?: { keys?: string[] }
): string {
    const keys = (opts?.keys ?? Object.keys(record)).filter(
        (key) => record[key] !== undefined
    );
    return keys.map((key) => `${key}=${inlineValue(record[key])}`).join(' | ');
}

export function formatRecordArray(
    items: unknown[],
    opts?: { label?: string; maxItems?: number; keys?: string[] }
): string {
    const label = opts?.label ?? 'items';
    const maxItems = opts?.maxItems ?? 20;
    if (items.length === 0) return `0 ${label}`;

    const shown = items.slice(0, maxItems);
    const lines = shown.map((item, index) => {
        if (isRecord(item)) {
            return `${index + 1}. ${formatInlineRecord(item, {
                keys: opts?.keys
            })}`;
        }
        return `${index + 1}. ${inlineValue(item)}`;
    });
    const more = items.length - shown.length;
    return [
        `${items.length} ${label}`,
        ...lines,
        ...(more > 0 ? [`... (${more} more)`] : [])
    ].join('\n');
}

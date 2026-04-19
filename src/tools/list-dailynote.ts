import type { ToolSchema } from '../core/schema.js';
import { escapeSqliteLiteral } from '../utils/sql.js';

type DailyRow = {
    id: string;
    box: string;
    hpath: string;
    path: string;
    created: string;
};

function normalizeDate(dateStr: string): Date {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${dateStr}`);
    return d;
}

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

export const tool: ToolSchema = {
    id: 'list-dailynote',
    summary: 'List daily note documents for a date or date range',
    tags: ['read', 'aggregate'],
    input: {
        type: 'object',
        additionalProperties: false,
        properties: {
            atDate: { type: 'string', description: 'Single date, yyyy-MM-dd' },
            beforeDate: {
                type: 'string',
                description: 'Inclusive upper bound, yyyy-MM-dd'
            },
            afterDate: {
                type: 'string',
                description: 'Inclusive lower bound, yyyy-MM-dd'
            },
            notebookId: {
                type: 'string',
                description: 'Optional notebook ID filter'
            }
        }
    },
    async run(ctx, input) {
        const { atDate, beforeDate, afterDate, notebookId } = input as {
            atDate?: string;
            beforeDate?: string;
            afterDate?: string;
            notebookId?: string;
        };

        if (atDate && (beforeDate || afterDate)) {
            throw new Error(
                'atDate is mutually exclusive with beforeDate/afterDate.'
            );
        }

        let before: Date | undefined;
        let after: Date | undefined;
        if (atDate) {
            const d = normalizeDate(atDate);
            before = endOfDay(d);
            after = startOfDay(d);
        } else {
            before = beforeDate
                ? endOfDay(normalizeDate(beforeDate))
                : undefined;
            after = afterDate
                ? startOfDay(normalizeDate(afterDate))
                : undefined;
            if (!before && !after) {
                const today = new Date();
                before = endOfDay(today);
                after = startOfDay(today);
            }
        }

        let stmt =
            "SELECT id, box, hpath, path, created FROM blocks WHERE type='d' AND hpath LIKE '%/daily note/%'";
        if (notebookId)
            stmt += ` AND box = '${escapeSqliteLiteral(notebookId)}'`;
        stmt += ' ORDER BY created DESC LIMIT 200';

        const rows = await ctx.callEndpoint<DailyRow[]>('query.sql', { stmt });
        let skippedUnparseable = 0;
        const filtered = rows.filter((r) => {
            const s = typeof r.created === 'string' ? r.created : '';
            if (s.length < 14) {
                skippedUnparseable++;
                return false;
            }
            const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`;
            const created = new Date(iso);
            if (Number.isNaN(created.getTime())) {
                skippedUnparseable++;
                return false;
            }
            if (before && created > before) return false;
            if (after && created < after) return false;
            return true;
        });

        const content = filtered.length
            ? `# Daily Notes (${filtered.length})\n` +
              filtered
                  .map((r) => `- ${r.created.slice(0, 8)} [${r.id}] ${r.hpath}`)
                  .join('\n')
            : 'No daily notes found.';

        return {
            content,
            details: {
                entries: filtered.map((r) => ({
                    id: r.id,
                    notebook: r.box,
                    hpath: r.hpath,
                    path: r.path,
                    created: r.created
                }))
            },
            warnings:
                skippedUnparseable > 0
                    ? [
                          `skipped ${skippedUnparseable} row(s) with unparseable 'created' field`
                      ]
                    : undefined
        };
    }
};

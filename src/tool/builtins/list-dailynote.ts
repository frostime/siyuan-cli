import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

type DailyRow = {
    id: string;
    box: string;
    hpath: string;
    path: string;
    created: string;
};

type NotebookInfo = {
    id: string;
    name: string;
    closed: boolean;
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
    classification: { action: 'read', domain: 'content' },
    guard: {
        payloadTargets: [
            { path: 'notebookId', kind: 'notebook', access: 'read', skipEmpty: true }
        ]
    },
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

        // Convert Date to SiYuan yyyyMMdd format (used in attribute values)
        const toAttrDate = (d: Date): string =>
            `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

        let stmt = `SELECT DISTINCT B.id, B.box, B.hpath, B.path, B.created
  FROM blocks AS B
  JOIN attributes AS A ON B.id = A.block_id
  WHERE A.name LIKE 'custom-dailynote-%'
    AND B.type = 'd'`;

        // Date filtering uses the attribute value (yyyyMMdd), which is more
        // reliable than hpath matching and works regardless of path templates.
        if (after) stmt += `\n    AND A.value >= '${toAttrDate(after)}'`;
        if (before) stmt += `\n    AND A.value <= '${toAttrDate(before)}'`;

        if (notebookId)
            stmt += `\n    AND B.box = '${escapeSqliteLiteral(notebookId)}'`;

        stmt += '\n  ORDER BY A.value DESC\n  LIMIT 200';

        // Fetch notebook names for display
        const notebooks = await ctx.callEndpoint<{ notebooks: NotebookInfo[] }>(
            'notebook.lsNotebooks',
            {}
        );
        const notebookMap = new Map(
            notebooks.notebooks.map((nb) => [nb.id, nb.name])
        );

        const rows = await ctx.callEndpoint<DailyRow[]>('query.sql', { stmt });

        const content = rows.length
            ? `# Daily Notes (${rows.length})\n` +
              rows
                  .map((r) => {
                      const nbName = notebookMap.get(r.box);
                      const nbLabel = nbName ? `${nbName} (${r.box})` : r.box;
                      return `- [${r.id}] ${r.hpath} (notebook: ${nbLabel})`;
                  })
                  .join('\n')
            : 'No daily notes found.';

        return {
            content,
            details: {
                entries: rows.map((r) => ({
                    id: r.id,
                    notebook: r.box,
                    hpath: r.hpath,
                    path: r.path,
                    created: r.created
                }))
            }
        };
    }
};

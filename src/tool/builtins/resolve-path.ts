import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

export const tool: ToolSchema = {
    id: 'resolve-path',
    summary: 'Resolve hpath or id to stable SiYuan path',
    tags: ['read', 'util'],
    input: {
        type: 'object',
        additionalProperties: false,
        properties: {
            hpath: { type: 'string', description: 'Human-readable hpath' },
            id: { type: 'string', description: 'Block or document ID' }
        }
    },
    cli: {
        examples: [
            { command: 'siyuan tool resolve-path --hpath "/daily/notes"' },
            { command: 'siyuan tool resolve-path --id 20260417090223-xxxxxxx' }
        ]
    },
    async run(ctx, input) {
        const { hpath, id } = input as { hpath?: string; id?: string };
        if ((hpath ? 1 : 0) + (id ? 1 : 0) !== 1) {
            throw new Error('Exactly one of --hpath or --id is required.');
        }
        // SiYuan's /api/query/sql takes a literal SQL string (no placeholders).
        // Build the query directly, escaping only single quotes per SQLite rules.
        const value = escapeSqliteLiteral((hpath ?? id)!);
        const stmt = hpath
            ? `SELECT id, box, path, hpath FROM blocks WHERE type='d' AND hpath = '${value}'`
            : `SELECT id, box, path, hpath FROM blocks WHERE id = '${value}'`;
        const rows = await ctx.callEndpoint<
            Array<{ id: string; box: string; path: string; hpath: string }>
        >('query.sql', { stmt });
        const matches = rows.map((r) => ({
            id: r.id,
            notebook: r.box,
            path: r.path,
            hpath: r.hpath
        }));
        const content = matches.length
            ? `Found ${matches.length} match(es):\n` +
              matches
                  .map((m) => `- ${m.path} (hpath=${m.hpath}, id=${m.id})`)
                  .join('\n')
            : 'No matches found.';
        return { content, details: { matches } };
    }
};

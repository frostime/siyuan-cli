import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

interface BlockRow {
    rowid: number;
    id: string;
    parent_id: string;
    root_id: string;
    box: string;
    type: string;
    subtype: string;
    content: string;
    markdown: string;
    sort: number;
}

interface BreadcrumbItem {
    id: string;
    name: string;
    type: string;
    subType: string;
}

interface SiblingResult {
    parent: string;
    previous: string;
    next: string;
}

const TYPE_LABELS: Record<string, string> = {
    d: 'doc',
    h: 'heading',
    p: 'para',
    c: 'code',
    m: 'math',
    t: 'table',
    b: 'blockquote',
    l: 'list',
    i: 'listitem',
    s: 'superblock',
    html: 'html',
    av: 'attrview',
    tb: 'thbreak',
    audio: 'audio',
    video: 'video',
    widget: 'widget',
    iframe: 'iframe',
    query_embed: 'embed'
};

function typeLabel(type: string, subtype: string): string {
    if (type === 'h' && subtype) return subtype;
    return TYPE_LABELS[type] ?? type;
}

function truncate(text: string, max: number): string {
    const flat = text.replace(/\n/g, '↵');
    if (flat.length <= max) return flat;
    return flat.slice(0, max) + '…';
}

export const tool: ToolSchema = {
    id: 'locate-block',
    summary: 'SiYuan grep: locate blocks by LIKE pattern on markdown field, with breadcrumb and sibling context',
    description: `Search blocks using SQLite LIKE patterns against the markdown field.
Patterns use % (any chars) and _ (single char). Wrap with % for substring match.
Multiple patterns: separate with | for OR, add --all for AND.
Scope: --id (document), --box (notebook), or omit both for global search.`,
    tags: ['read'],
    classification: { action: 'read', domain: 'content' },
    guard: {
        payloadTargets: [
            { path: 'id', kind: 'id', access: 'read', skipEmpty: true },
            { path: 'box', kind: 'notebook', access: 'read', skipEmpty: true }
        ]
    },
    input: {
        type: 'object',
        required: ['pattern'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document or block ID to scope search (uses root_id). Omit for broader scope.'
            },
            box: {
                type: 'string',
                description: 'Notebook ID to scope search. Used when --id is not provided.'
            },
            pattern: {
                type: 'string',
                description:
                    'LIKE pattern(s) matched against markdown field. Use % for wildcard. Multiple patterns separated by "|". Examples: "%workspace%", "%```bash%", "%**bold**%"'
            },
            all: {
                type: 'boolean',
                description: 'When true, block must match ALL patterns (AND). Default: false (OR).'
            },
            invert: {
                type: 'boolean',
                description: 'Invert match: return blocks that do NOT match the pattern(s). Like grep -v.'
            },
            type: {
                type: 'string',
                description: 'Filter by block type, e.g. "h", "p", "c", "l". Comma-separated for multiple: "p,h"'
            },
            field: {
                type: 'string',
                description: 'Field to match against: "markdown" (default) or "content" (plain text).'
            },
            limit: {
                type: 'integer',
                description: 'Max results (default: 20)'
            },
            context: {
                type: 'boolean',
                description: 'Show breadcrumb and sibling context (default: true). Set false for compact ID-only output.'
            },
            width: {
                type: 'integer',
                description: 'Max chars for content preview per line (default: 90)'
            },
            count: {
                type: 'boolean',
                description: 'Count mode: only output the number of matching blocks (like grep -c).'
            }
        }
    },
    cli: {
        primary: 'pattern',
        allowSource: {
            pattern: ['literal', 'stdin']
        },
        examples: [
            { command: 'siyuan tool locate-block "%keyword%"' },
            { command: 'siyuan tool locate-block --id 20241016135347-zlrn2cz --pattern "%**bold**%"' },
            { command: 'siyuan tool locate-block --box 20210808180117-czj9bvb --pattern "%A%|%B%" --all true' }
        ]
    },

    async run(ctx, raw) {
        const input = raw as {
            id?: string;
            box?: string;
            pattern: string;
            all?: boolean;
            invert?: boolean;
            type?: string;
            field?: string;
            limit?: number;
            context?: boolean;
            width?: number;
            count?: boolean;
        };

        const patterns = input.pattern
            .split('|')
            .map((p) => p.trim())
            .filter(Boolean);
        const isAnd = input.all ?? false;
        const invert = input.invert ?? false;
        const field = input.field === 'content' ? 'content' : 'markdown';
        const limit = input.limit ?? 20;
        const showContext = input.context !== false;
        const width = input.width ?? 90;
        const countOnly = input.count ?? false;

        if (patterns.length === 0) {
            return { content: 'No patterns provided.' };
        }

        let scopeClause = '';
        let scopeLabel = 'global';

        if (input.id) {
            let rootId = input.id;
            const rows = await ctx.callEndpoint<BlockRow[]>('query.sql', {
                stmt: `SELECT root_id FROM blocks WHERE id = '${escapeSqliteLiteral(input.id)}' LIMIT 1`
            });
            if (rows.length > 0) rootId = rows[0]!.root_id;
            scopeClause = `root_id = '${escapeSqliteLiteral(rootId)}'`;
            scopeLabel = `doc:${rootId}`;
        } else if (input.box) {
            scopeClause = `box = '${escapeSqliteLiteral(input.box)}'`;
            scopeLabel = `notebook:${input.box}`;
        }

        let typeClause = '';
        if (input.type) {
            const types = input.type
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
            if (types.length === 1) {
                typeClause = `type = '${escapeSqliteLiteral(types[0]!)}'`;
            } else if (types.length > 1) {
                typeClause = `type IN (${types.map((t) => `'${escapeSqliteLiteral(t)}'`).join(',')})`;
            }
        }

        const likeClauses = patterns.map((p) => {
            const clause = `${field} LIKE '${escapeSqliteLiteral(p)}'`;
            return invert ? `NOT (${clause})` : clause;
        });
        const patternClause = isAnd
            ? likeClauses.join(' AND ')
            : invert
              ? likeClauses.join(' AND ')
              : likeClauses.join(' OR ');

        const conditions = [
            "type != 'd'",
            `(${patternClause})`,
            ...(scopeClause ? [scopeClause] : []),
            ...(typeClause ? [typeClause] : [])
        ];

        if (countOnly) {
            const countSql = `SELECT COUNT(*) as cnt FROM blocks WHERE ${conditions.join(' AND ')}`;
            const countRows = await ctx.callEndpoint<{ cnt: number }[]>('query.sql', { stmt: countSql });
            const count = countRows[0]?.cnt ?? 0;
            return {
                content: `${count} block(s) matched.\nScope: ${scopeLabel}\nPatterns: ${patterns.join(isAnd ? ' AND ' : ' | ')}${invert ? ' (inverted)' : ''}`,
                details: { count, scope: scopeLabel, patterns }
            };
        }

        const sql = `SELECT rowid, id, parent_id, root_id, box, type, subtype, content, markdown, sort
            FROM blocks
            WHERE ${conditions.join(' AND ')}
            ORDER BY sort ASC
            LIMIT ${limit}`;

        const rows = await ctx.callEndpoint<BlockRow[]>('query.sql', { stmt: sql });

        if (rows.length === 0) {
            return {
                content: `No blocks matched.\nScope: ${scopeLabel}\nPatterns: ${patterns.join(isAnd ? ' AND ' : ' | ')}${invert ? ' (inverted)' : ''}`
            };
        }

        const lines: string[] = [];
        lines.push(`${rows.length} match(es) | scope: ${scopeLabel} | field: ${field}`);
        lines.push(`pattern: ${patterns.join(isAnd ? ' AND ' : ' | ')}${invert ? ' [inverted]' : ''}`);
        lines.push('');

        if (!showContext) {
            for (const row of rows) {
                const label = typeLabel(row.type, row.subtype);
                lines.push(`${row.id} [${label}] ${truncate(row.markdown, width)}`);
            }
        } else {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i]!;
                const label = typeLabel(row.type, row.subtype);

                let breadcrumbStr = '';
                try {
                    const crumbs = await ctx.callEndpoint<BreadcrumbItem[]>('block.getBlockBreadcrumb', { id: row.id });
                    if (crumbs.length > 1) {
                        const ancestors = crumbs.slice(0, -1);
                        breadcrumbStr = ancestors
                            .map((c) => {
                                const t = c.subType || c.type.replace('Node', '').toLowerCase();
                                const name = c.name ? truncate(c.name, 30) : '';
                                return name ? `[${t}] ${name}` : `[${t}]`;
                            })
                            .join(' > ');
                    }
                } catch {
                    breadcrumbStr = '?';
                }

                let prevId = '';
                let nextId = '';
                try {
                    const sib = await ctx.callEndpoint<SiblingResult>('block.getBlockSiblingID', { id: row.id });
                    prevId = sib.previous ?? '';
                    nextId = sib.next ?? '';
                } catch {
                    // sibling context is best-effort
                }

                // Some SiYuan block types return empty previous/next from getBlockSiblingID.
                // Fall back to SQL sibling lookup so context mode remains useful for edit targeting.
                if (!prevId) {
                    try {
                        const siblingRows = await ctx.callEndpoint<Array<{ id: string }>>('query.sql', {
                            stmt: `SELECT id FROM blocks
                                WHERE parent_id = '${escapeSqliteLiteral(row.parent_id)}'
                                  AND id != '${escapeSqliteLiteral(row.id)}'
                                  AND rowid < ${row.rowid}
                                ORDER BY rowid DESC
                                LIMIT 1`
                        });
                        prevId = siblingRows[0]?.id ?? '';
                    } catch {
                        // SQL sibling fallback is best-effort
                    }
                }
                if (!nextId) {
                    try {
                        const siblingRows = await ctx.callEndpoint<Array<{ id: string }>>('query.sql', {
                            stmt: `SELECT id FROM blocks
                                WHERE parent_id = '${escapeSqliteLiteral(row.parent_id)}'
                                  AND id != '${escapeSqliteLiteral(row.id)}'
                                  AND rowid > ${row.rowid}
                                ORDER BY rowid ASC
                                LIMIT 1`
                        });
                        nextId = siblingRows[0]?.id ?? '';
                    } catch {
                        // SQL sibling fallback is best-effort
                    }
                }

                let prevLine = '';
                let nextLine = '';
                if (prevId) {
                    try {
                        const pr = await ctx.callEndpoint<BlockRow[]>('query.sql', {
                            stmt: `SELECT type, subtype, content FROM blocks WHERE id = '${escapeSqliteLiteral(prevId)}' LIMIT 1`
                        });
                        if (pr.length > 0) {
                            prevLine = `  ↑ ${prevId} [${typeLabel(pr[0]!.type, pr[0]!.subtype)}] ${truncate(pr[0]!.content, width - 20)}`;
                        }
                    } catch {
                        // sibling preview is best-effort
                    }
                }
                if (nextId) {
                    try {
                        const nr = await ctx.callEndpoint<BlockRow[]>('query.sql', {
                            stmt: `SELECT type, subtype, content FROM blocks WHERE id = '${escapeSqliteLiteral(nextId)}' LIMIT 1`
                        });
                        if (nr.length > 0) {
                            nextLine = `  ↓ ${nextId} [${typeLabel(nr[0]!.type, nr[0]!.subtype)}] ${truncate(nr[0]!.content, width - 20)}`;
                        }
                    } catch {
                        // sibling preview is best-effort
                    }
                }

                lines.push(`━━━ ${i + 1}/${rows.length} ━━━`);
                lines.push(`ID    : ${row.id}  [${label}]  parent: ${row.parent_id}`);
                if (breadcrumbStr) {
                    lines.push(`Path  : ${breadcrumbStr}`);
                }
                lines.push(`Match : ${truncate(row.markdown, width)}`);
                if (prevLine || nextLine) {
                    lines.push('---');
                    if (prevLine) lines.push(prevLine);
                    lines.push(`  ● ${row.id} [${label}]`);
                    if (nextLine) lines.push(nextLine);
                }
                lines.push('');
            }
        }

        return {
            content: lines.join('\n'),
            details: rows.map((r) => ({
                id: r.id,
                type: typeLabel(r.type, r.subtype),
                parentId: r.parent_id,
                rootId: r.root_id,
                markdown: r.markdown
            }))
        };
    }
};

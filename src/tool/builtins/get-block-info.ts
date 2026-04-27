import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

// ————— types —————

interface BreadcrumbItem {
    id: string;
    name: string;
    type: string;
    subType: string;
}

interface HeaderNode {
    blockId: string;
    content: string;
    level: number;
    children: HeaderNode[];
}

interface BlockRow {
    id: string;
    box: string;
    path: string;
    hpath: string;
    root_id: string;
    parent_id: string;
    type: string;
    subtype: string;
    content: string;
    markdown: string;
    created: string;
    updated: string;
}

// ————— helpers —————

/** Block types that can contain child blocks in SiYuan. */
const CONTAINER_TYPES = new Set(['d', 'b', 'l', 'i', 's']);

/**
 * Build a heading TOC from a flat header list (ordered by sort/position).
 * Uses a stack to maintain parent tracking.
 */
function buildToc(headers: { id: string; content: string; subtype: string }[]): HeaderNode[] {
    const root: HeaderNode[] = [];
    const stack: { node: HeaderNode; level: number }[] = [];

    for (const h of headers) {
        const level = parseInt(h.subtype.replace('h', '') || '1', 10);
        const node: HeaderNode = { blockId: h.id, content: h.content, level, children: [] };

        while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
            stack.pop();
        }
        if (stack.length === 0) {
            root.push(node);
        } else {
            stack[stack.length - 1]!.node.children.push(node);
        }
        stack.push({ node, level });
    }
    return root;
}

function formatToc(nodes: HeaderNode[], indent = 0): string {
    const lines: string[] = [];
    for (const n of nodes) {
        lines.push(`${'  '.repeat(indent)}- [${n.blockId}] ${'#'.repeat(n.level)} ${n.content}`);
        if (n.children.length > 0) lines.push(formatToc(n.children, indent + 1));
    }
    return lines.join('\n');
}

function formatBreadcrumb(items: BreadcrumbItem[]): string {
    return items.map((b) => `[${b.id}][${b.type}${b.subType ? '/' + b.subType : ''}] ${b.name}`).join(' > ');
}

// ————— tool —————

export const tool: ToolSchema = {
    id: 'get-block-info',
    summary: 'Get metadata for one or more blocks (type, path, breadcrumb, TOC for docs, child count for containers)',
    tags: ['read'],
    input: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
            ids: {
                type: 'string',
                description:
                    'One or more block/document IDs, comma-separated (e.g. "20241016135347-zlrn2cz" or "id1,id2")'
            }
        }
    },
    cli: {
        primary: 'ids',
        examples: [
            { command: 'siyuan tool get-block-info 20241016135347-zlrn2cz' },
            { command: 'siyuan tool get-block-info --ids "id1,id2"' }
        ]
    },
    async run(ctx, input) {
        const { ids } = input as { ids: string };

        const idList = ids
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (idList.length === 0) throw new Error('ids is required.');

        const escaped = idList.map((id) => `'${escapeSqliteLiteral(id)}'`).join(', ');
        const rows = await ctx.callEndpoint<BlockRow[]>('query.sql', {
            stmt: `SELECT id, box, path, hpath, root_id, parent_id, type, subtype, content, markdown, created, updated
  FROM blocks WHERE id IN (${escaped})`
        });

        const rowMap = new Map(rows.map((r) => [r.id, r]));
        const results: Record<string, unknown>[] = [];

        for (const id of idList) {
            const row = rowMap.get(id);
            if (!row) {
                results.push({ id, found: false });
                continue;
            }

            const entry: Record<string, unknown> = {
                id: row.id,
                found: true,
                type: row.type,
                subtype: row.subtype || undefined,
                box: row.box,
                hpath: row.hpath,
                root_id: row.root_id,
                parent_id: row.parent_id || undefined,
                created: row.created,
                updated: row.updated,
                contentLength: row.content?.length ?? 0,
                markdownLength: row.markdown?.length ?? 0
            };

            // Breadcrumb (skip for document blocks — they are their own root)
            if (row.type !== 'd') {
                try {
                    const crumbs = await ctx.callEndpoint<BreadcrumbItem[]>(
                        'block.getBlockBreadcrumb',
                        { id: row.id }
                    );
                    if (crumbs?.length) entry.breadcrumb = crumbs;
                } catch {
                    // breadcrumb is best-effort
                }
            }

            // Child count for container blocks
            if (CONTAINER_TYPES.has(row.type)) {
                try {
                    const children = await ctx.callEndpoint<{ id: string }[]>(
                        'block.getChildBlocks',
                        { id: row.id }
                    );
                    entry.childBlockCount = children.length;
                } catch {
                    entry.childBlockCount = 0;
                }
            }

            // TOC for document blocks
            if (row.type === 'd') {
                try {
                    const headers = await ctx.callEndpoint<
                        { id: string; content: string; subtype: string }[]
                    >('query.sql', {
                        stmt: `SELECT id, content, subtype FROM blocks
  WHERE root_id = '${escapeSqliteLiteral(row.id)}' AND type = 'h'
  ORDER BY sort`
                    });
                    if (headers.length > 0) entry.toc = buildToc(headers);
                } catch {
                    // TOC is best-effort
                }
            }

            results.push(entry);
        }

        // ————— format content —————
        const lines: string[] = [];
        for (const entry of results) {
            if (!entry.found) {
                lines.push(`[${entry.id}] NOT FOUND`);
                lines.push('');
                continue;
            }
            lines.push(`=== Block [${entry.id}] ===`);
            lines.push(`  type: ${entry.type}${entry.subtype ? '/' + entry.subtype : ''}`);
            lines.push(`  hpath: ${entry.hpath}`);
            lines.push(`  box: ${entry.box}`);
            if (entry.type !== 'd') lines.push(`  root_id: ${entry.root_id}`);
            if (entry.parent_id) lines.push(`  parent_id: ${entry.parent_id}`);
            lines.push(`  created: ${entry.created}  updated: ${entry.updated}`);
            lines.push(`  content length: ${entry.contentLength}  markdown length: ${entry.markdownLength}`);

            if (entry.childBlockCount !== undefined) {
                lines.push(`  child blocks: ${entry.childBlockCount}`);
            }

            if (entry.breadcrumb) {
                lines.push(`  breadcrumb: ${formatBreadcrumb(entry.breadcrumb as BreadcrumbItem[])}`);
            }

            if (entry.toc) {
                lines.push('  TOC:');
                const tocStr = formatToc(entry.toc as HeaderNode[], 2);
                if (tocStr) lines.push(tocStr);
            }

            lines.push('');
        }

        return {
            content: lines.join('\n').trimEnd(),
            details: results.length === 1 ? results[0] : { blocks: results }
        };
    }
};

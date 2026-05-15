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

interface ChildBlockRow {
    id: string;
    type: string;
    subType?: string;
    content?: string;
    markdown?: string;
}

interface OutlineNode {
    id: string;
    name?: string;
    content?: string;
    subType?: string;
    blocks?: OutlineNode[];
}

// ————— helpers —————

/** Block types that can contain child blocks in SiYuan. */
const CONTAINER_TYPES = new Set(['d', 'b', 'l', 'i', 's']);

function parseHeadingLevel(subtype: string | undefined): number | null {
    if (!subtype) return null;
    const m = /^h([1-6])$/i.exec(subtype.trim());
    if (!m) return null;
    return Number(m[1]);
}

function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

/**
 * Build a heading TOC from a flat header list (ordered by row position).
 * Uses a stack to maintain parent tracking.
 */
function buildTocFromFlatHeaders(headers: { id: string; content: string; subtype: string }[]): HeaderNode[] {
    const root: HeaderNode[] = [];
    const stack: { node: HeaderNode; level: number }[] = [];

    for (const h of headers) {
        const level = parseHeadingLevel(h.subtype);
        if (!level) continue;

        const node: HeaderNode = {
            blockId: h.id,
            content: decodeHtmlEntities(h.content ?? ''),
            level,
            children: []
        };

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

function buildTocFromOutline(nodes: OutlineNode[]): HeaderNode[] {
    const visit = (node: OutlineNode): HeaderNode | null => {
        const level = parseHeadingLevel(node.subType);
        if (!level) return null;

        const content = decodeHtmlEntities(node.content ?? node.name ?? '');
        const children: HeaderNode[] = [];
        for (const child of node.blocks ?? []) {
            const childNode = visit(child);
            if (childNode) children.push(childNode);
        }

        return {
            blockId: node.id,
            content,
            level,
            children
        };
    };

    const out: HeaderNode[] = [];
    for (const node of nodes) {
        const heading = visit(node);
        if (heading) out.push(heading);
    }
    return out;
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

function formatSafetyLine(s: Record<string, unknown>): string {
    const parts: string[] = [];

    // backlinks
    const bl = s['backlinkCount'] as number | undefined;
    if (bl !== undefined && bl >= 0) parts.push(`backlinks=${bl}`);
    else if (bl === -1) parts.push('backlinks=?');

    // own custom attrs
    const ownAttrs = s['ownCustomAttrs'] as string[] | undefined;
    if (ownAttrs && ownAttrs.length > 0) {
        parts.push(`custom=self(${ownAttrs.join(',')})`);
    }

    // av binding
    const avBindings = s['avBindings'] as Array<{ avID: string; avName: string }> | undefined;
    if (avBindings && avBindings.length > 0) {
        const names = avBindings.map((a) => a.avName || a.avID).join(', ');
        parts.push(`av=${avBindings.length}(${names})`);
    }

    // in-doc custom attrs
    const inDocCustom = s['inDocCustomAttrCount'] as number | undefined;
    if (inDocCustom !== undefined && inDocCustom > 0) {
        parts.push(`children-custom=${inDocCustom}`);
    }

    // in-doc external refs
    const inDocRefs = s['inDocExtRefCount'] as number | undefined;
    if (inDocRefs !== undefined && inDocRefs > 0) {
        parts.push(`children-ext-refs=${inDocRefs}`);
    }

    if (parts.length === 0) return '';
    return `  safety: ${parts.join(' · ')}`;
}

function sumLengths(values: Array<string | undefined>): number {
    return values.reduce((acc, value) => acc + (value?.length ?? 0), 0);
}

// ————— tool —————

export const tool: ToolSchema = {
    id: 'get-block-info',
    summary: 'Get metadata for one or more blocks (type, path, breadcrumb, TOC for docs, child count for containers)',
    tags: ['read'],
    classification: { action: 'read', domain: 'content' },
    input: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description:
                    'One or more block/document IDs, comma-separated (e.g. "20241016135347-zlrn2cz" or "id1,id2")'
            }
        }
    },
    cli: {
        primary: 'id',
        examples: [
            { command: 'siyuan tool get-block-info 20241016135347-zlrn2cz' },
            { command: 'siyuan tool get-block-info --id "id1,id2"' }
        ]
    },
    async run(ctx, input) {
        const { id } = input as { id: string };

        const idList = id
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (idList.length === 0) throw new Error('id is required.');

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

            let childBlocks: ChildBlockRow[] | undefined;

            // Child count for container blocks
            if (CONTAINER_TYPES.has(row.type)) {
                try {
                    childBlocks = await ctx.callEndpoint<ChildBlockRow[]>('block.getChildBlocks', {
                        id: row.id
                    });
                    entry.childBlockCount = childBlocks.length;
                } catch {
                    entry.childBlockCount = 0;
                    childBlocks = [];
                }
            }

            // ————— Safety signals (backlinks, custom attrs, av binding) —————
            const safety: Record<string, unknown> = {};

            // 1. Backlinks
            try {
                const blRows = await ctx.callEndpoint<Array<{ cnt: number }>>('query.sql', {
                    stmt: `SELECT COUNT(*) AS cnt FROM refs WHERE def_block_id = '${escapeSqliteLiteral(row.id)}'`
                });
                safety.backlinkCount = blRows[0]?.cnt ?? 0;
            } catch {
                safety.backlinkCount = -1;
            }

            // 2. Custom attrs (own)
            try {
                const attrRows = await ctx.callEndpoint<Array<{ name: string; value: string }>>('query.sql', {
                    stmt: `SELECT name, value FROM attributes WHERE block_id = '${escapeSqliteLiteral(row.id)}' AND name LIKE 'custom-%'`
                });
                if (attrRows.length > 0) safety.ownCustomAttrs = attrRows.map((r) => r.name);
            } catch {
                // best-effort
            }

            // 3. AV binding (raw kernel API)
            try {
                const avResult = await ctx.callEndpointRaw<Array<{ avID: string; avName: string; blockIDs: string[] }>>(
                    '/api/av/getAttributeViewKeys',
                    { id: row.id }
                );
                if (avResult && avResult.length > 0) {
                    safety.avBindings = avResult.map((item) => ({
                        avID: item.avID,
                        avName: decodeHtmlEntities(item.avName)
                    }));
                }
            } catch {
                // best-effort
            }

            entry.safety = safety;

            // TOC + document content length for document blocks
            if (row.type === 'd') {
                if (!childBlocks) {
                    try {
                        childBlocks = await ctx.callEndpoint<ChildBlockRow[]>('block.getChildBlocks', {
                            id: row.id
                        });
                    } catch {
                        childBlocks = [];
                    }
                }

                // For docs, compute lengths from actual child-block content instead of root-row fields.
                entry.contentLength = sumLengths(childBlocks.map((b) => b.content));
                entry.markdownLength = sumLengths(childBlocks.map((b) => b.markdown));

                // 4. In-doc custom attrs (children)
                const escapedRowId = escapeSqliteLiteral(row.id);
                try {
                    const inDocCustom = await ctx.callEndpoint<Array<{ cnt: number }>>('query.sql', {
                        stmt: `SELECT COUNT(*) AS cnt FROM attributes WHERE block_id IN (SELECT id FROM blocks WHERE root_id='${escapedRowId}' AND id!='${escapedRowId}') AND name LIKE 'custom-%'`
                    });
                    safety.inDocCustomAttrCount = inDocCustom[0]?.cnt ?? 0;
                } catch {
                    // best-effort
                }

                // 5. In-doc external inbound refs (children)
                try {
                    const inDocRefs = await ctx.callEndpoint<Array<{ cnt: number }>>('query.sql', {
                        stmt: `SELECT COUNT(*) AS cnt FROM refs WHERE def_block_id IN (SELECT id FROM blocks WHERE root_id='${escapedRowId}' AND id!='${escapedRowId}') AND root_id != '${escapedRowId}'`
                    });
                    safety.inDocExtRefCount = inDocRefs[0]?.cnt ?? 0;
                } catch {
                    // best-effort
                }

                try {
                    const outline = await ctx.callEndpoint<OutlineNode[]>('outline.getDocOutline', {
                        id: row.id,
                        preview: false
                    });
                    const toc = buildTocFromOutline(outline);
                    if (toc.length > 0) entry.toc = toc;
                } catch {
                    // Fallback for kernels without outline.getDocOutline.
                    try {
                        const headers = await ctx.callEndpoint<
                            { id: string; content: string; subtype: string }[]
                        >('query.sql', {
                            stmt: `SELECT id, content, subtype FROM blocks
  WHERE root_id = '${escapeSqliteLiteral(row.id)}' AND type = 'h'
  ORDER BY rowid`
                        });
                        if (headers.length > 0) entry.toc = buildTocFromFlatHeaders(headers);
                    } catch {
                        // TOC is best-effort
                    }
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

            if (entry.safety) {
                lines.push(formatSafetyLine(entry.safety as Record<string, unknown>));
            }

            lines.push('');
        }

        return {
            content: lines.join('\n').trimEnd(),
            details: results.length === 1 ? results[0] : { blocks: results }
        };
    }
};

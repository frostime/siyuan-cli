import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

// ————— read model —————

type RangeMode = 'self' | 'children' | 'context' | 'before' | 'after';

interface ContentBlock {
    rowid: number;
    id: string;
    type: string;
    markdown: string;
    isAnchor?: boolean;
}

interface RootRow {
    rowid: number;
    id: string;
    parent_id: string;
    root_id: string;
    box: string;
    type: string;
    subtype: string;
    markdown: string;
    content: string;
}

const CHILD_CONTAINER_TYPES = new Set(['d', 'h', 'b', 'l', 'i', 's']);
const DEFAULT_LIMIT = 30;
const DEFAULT_CONTEXT_LIMIT = 7;

function blockType(type: string, subtype?: string): string {
    return type + (subtype ? `/${subtype}` : '');
}

function isRangeMode(value: unknown): value is RangeMode {
    return value === 'self' || value === 'children' || value === 'context' || value === 'before' || value === 'after';
}

function normalizeLimit(raw: unknown, fallback: number): number {
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error('--limit must be a positive integer.');
    }
    return value;
}

function renderBlock(block: ContentBlock, showId: boolean): string {
    if (!showId) return block.markdown ?? '';
    return `@@${block.id}@@${block.type}\n${block.markdown ?? ''}`;
}

function trimChildren(children: ContentBlock[], limit: number): { blocks: ContentBlock[]; truncated: boolean } {
    return {
        blocks: children.slice(0, limit),
        truncated: children.length > limit
    };
}

// ————— tool —————

export const tool: ToolSchema = {
    id: 'get-block-content',
    summary: 'Read bounded Markdown content around a block, with optional ID annotations',
    description: `Reads Markdown from a block id using one anchor + one range.

Default behavior:
- Leaf blocks return their own raw Markdown.
- Document, heading, and container blocks return their first child blocks with a hidden safety limit.
- Multi-block reads are bounded by --limit to avoid accidental full-document dumps.

Range modes:
- self: only the anchor block itself.
- children: child blocks of the anchor block.
- context: sibling window around the anchor, including the anchor.
- before: sibling blocks before the anchor.
- after: sibling blocks after the anchor.

Output contract:
- Header appears before --- BEGIN ... --- and contains metadata, warnings, and continuation hints.
- Body after the BEGIN line is the content.
- showId=true injects @@id@@type markers into the body for edit targeting; those markers are not SiYuan source text and should not be used as brute-edit search text.`,
    tags: ['read'],
    input: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Anchor block or document ID'
            },
            range: {
                type: 'string',
                description: 'Relative read range: self, children, context, before, or after. Default: self for leaf blocks; children for document/heading/container blocks.'
            },
            limit: {
                type: 'integer',
                description: `Maximum returned blocks for multi-block ranges. Defaults: ${DEFAULT_LIMIT} for children/before/after, ${DEFAULT_CONTEXT_LIMIT} for context.`
            },
            showId: {
                type: 'boolean',
                description: 'Inject @@{blockId}@@{type} markers into the body for edit targeting. Default: false. Do not use annotated body as brute-edit search text.'
            }
        }
    },
    cli: {
        primary: 'id',
        examples: [
            { command: 'siyuan tool get-block-content 20241016135347-zlrn2cz' },
            { command: 'siyuan tool get-block-content 20241016135347-zlrn2cz --range context --limit 7' },
            { command: 'siyuan tool get-block-content 20241016135347-zlrn2cz --range before --limit 5' },
            { command: 'siyuan tool get-block-content 20241016135347-zlrn2cz --range children --limit 30 --showId true' }
        ]
    },
    async run(ctx, input) {
        const raw = input as { id: string; range?: string; limit?: number; showId?: boolean };
        const showId = raw.showId ?? false;

        const rootRows = await ctx.callEndpoint<RootRow[]>('query.sql', {
            stmt: `SELECT rowid, id, parent_id, root_id, box, type, subtype, markdown, content
                FROM blocks
                WHERE id = '${escapeSqliteLiteral(raw.id)}'
                LIMIT 1`
        });

        if (rootRows.length === 0) throw new Error(`Block not found: ${raw.id}`);
        const root = rootRows[0]!;
        const canHaveChildren = CHILD_CONTAINER_TYPES.has(root.type);

        if (raw.range !== undefined && !isRangeMode(raw.range)) {
            throw new Error('--range must be one of: self, children, context, before, after.');
        }

        const range: RangeMode = raw.range ?? (canHaveChildren ? 'children' : 'self');
        const limitFallback = range === 'context' ? DEFAULT_CONTEXT_LIMIT : DEFAULT_LIMIT;
        const limit = range === 'self' ? 1 : normalizeLimit(raw.limit, limitFallback);

        const header: string[] = [];
        const warnings: string[] = [];
        let blocks: ContentBlock[] = [];
        let totalAvailable: number | undefined;
        let truncated = false;

        if (range === 'self') {
            blocks = [
                {
                    rowid: root.rowid,
                    id: root.id,
                    type: blockType(root.type, root.subtype),
                    markdown: root.markdown ?? '',
                    isAnchor: true
                }
            ];
            if (root.type === 'd') {
                warnings.push('DOC_SELF_TITLE_ONLY: document self content is only the title; use --range children --limit N to read body blocks.');
            }
        } else if (range === 'children') {
            if (!canHaveChildren) {
                throw new Error(`Range "children" is not applicable to leaf block ${root.id} (${blockType(root.type, root.subtype)}).`);
            }

            const children = await ctx.callEndpoint<
                { id: string; type: string; subType?: string; markdown: string }[]
            >('block.getChildBlocks', { id: root.id });
            totalAvailable = children.length;

            const childBlocks: ContentBlock[] = children.map((c, index) => ({
                rowid: index,
                id: c.id,
                type: blockType(c.type, c.subType),
                markdown: c.markdown ?? ''
            }));
            const trimmed = trimChildren(childBlocks, limit);
            blocks = trimmed.blocks;
            truncated = trimmed.truncated;

            if (root.type === 'd') {
                warnings.push('DOC_CHILDREN_DEFAULT: document self content is only the title; body blocks start after the BEGIN line.');
            }
        } else {
            const parentId = root.parent_id || root.root_id || root.id;
            const comparison = range === 'before' ? '<' : '>';
            const order = range === 'before' ? 'DESC' : 'ASC';
            const fetchLimit = range === 'context' ? Math.max(1, Math.floor((limit - 1) / 2)) : limit;

            const fetchSiblings = async (direction: 'before' | 'after', count: number): Promise<ContentBlock[]> => {
                if (count < 1) return [];
                const op = direction === 'before' ? '<' : '>';
                const sortOrder = direction === 'before' ? 'DESC' : 'ASC';
                const rows = await ctx.callEndpoint<RootRow[]>('query.sql', {
                    stmt: `SELECT rowid, id, parent_id, root_id, box, type, subtype, markdown, content
                        FROM blocks
                        WHERE parent_id = '${escapeSqliteLiteral(parentId)}'
                          AND id != '${escapeSqliteLiteral(root.id)}'
                          AND rowid ${op} ${root.rowid}
                        ORDER BY rowid ${sortOrder}
                        LIMIT ${count + 1}`
                });
                if (rows.length > count) truncated = true;
                const selected = rows.slice(0, count).map((r) => ({
                    rowid: r.rowid,
                    id: r.id,
                    type: blockType(r.type, r.subtype),
                    markdown: r.markdown ?? ''
                }));
                return direction === 'before' ? selected.reverse() : selected;
            };

            if (range === 'context') {
                const beforeCount = fetchLimit;
                const afterCount = Math.max(0, limit - beforeCount - 1);
                const before = await fetchSiblings('before', beforeCount);
                const after = await fetchSiblings('after', afterCount);
                blocks = [
                    ...before,
                    {
                        rowid: root.rowid,
                        id: root.id,
                        type: blockType(root.type, root.subtype),
                        markdown: root.markdown ?? '',
                        isAnchor: true
                    },
                    ...after
                ];
            } else {
                const rows = await ctx.callEndpoint<RootRow[]>('query.sql', {
                    stmt: `SELECT rowid, id, parent_id, root_id, box, type, subtype, markdown, content
                        FROM blocks
                        WHERE parent_id = '${escapeSqliteLiteral(parentId)}'
                          AND id != '${escapeSqliteLiteral(root.id)}'
                          AND rowid ${comparison} ${root.rowid}
                        ORDER BY rowid ${order}
                        LIMIT ${limit + 1}`
                });
                truncated = rows.length > limit;
                blocks = rows.slice(0, limit).map((r) => ({
                    rowid: r.rowid,
                    id: r.id,
                    type: blockType(r.type, r.subtype),
                    markdown: r.markdown ?? ''
                }));
                if (range === 'before') blocks.reverse();
            }
        }

        const bodyLabel = showId ? 'ANNOTATED BLOCK CONTENT' : 'BLOCK CONTENT';
        if (showId) {
            warnings.push('SHOW_ID_ANNOTATED_BODY: @@id@@ markers are injected by siyuan-cli and are not source text; do not use annotated body as brute-edit search text.');
        }

        header.push('[siyuan-cli:get-block-content]');
        header.push(`anchor: ${root.id}`);
        header.push(`type: ${blockType(root.type, root.subtype)}`);
        header.push(`parent: ${root.parent_id || ''}`);
        header.push(`root: ${root.root_id}`);
        header.push(`range: ${range}`);
        header.push(`limit: ${limit}`);
        header.push(`returned: ${blocks.length}`);
        if (totalAvailable !== undefined) header.push(`available: ${totalAvailable}`);
        header.push(`truncated: ${truncated}`);
        header.push(`showId: ${showId}`);
        header.push(`body: ${showId ? 'annotated markdown with injected id markers' : 'raw markdown without injected id markers'}`);
        if (warnings.length > 0) {
            for (const warning of warnings) header.push(`warning: ${warning}`);
        }
        if (truncated && blocks.length > 0) {
            if (range === 'before') {
                const firstId = blocks[0]!.id;
                header.push(`next: siyuan tool get-block-content ${firstId} --range before --limit ${limit}${showId ? ' --showId true' : ''}`);
            } else if (range === 'children' || range === 'after') {
                const lastId = blocks[blocks.length - 1]!.id;
                header.push(`next: siyuan tool get-block-content ${lastId} --range after --limit ${limit}${showId ? ' --showId true' : ''}`);
            } else if (range === 'context') {
                header.push(`hint: context truncated; increase --limit if more neighboring blocks are needed.`);
            }
        }
        header.push(`--- BEGIN ${bodyLabel} ---`);

        const rendered = blocks.map((b) => renderBlock(b, showId)).join('\n\n');
        const content = `${header.join('\n')}\n${rendered}`;

        return {
            content,
            details: {
                id: root.id,
                blockType: root.type,
                range,
                limit,
                returned: blocks.length,
                truncated,
                showId,
                warnings,
                blocks: blocks.map((b) => ({ id: b.id, type: b.type, isAnchor: b.isAnchor ?? false }))
            }
        };
    }
};

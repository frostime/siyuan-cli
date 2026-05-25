import type { ToolSchema } from '@/shared/schema.js';
import {
    blockTypeLabel,
    buildBacklinksSql,
    buildBlocksByIdsSql,
    previewText,
    REF_TEXT_PREVIEW_LIMIT,
    resolveFirstBlockRedirect,
    SOURCE_PREVIEW_LIMIT,
    type BacklinkRow,
    type BlockTreeInfo,
    type RedirectReason
} from '@/shared/refs.js';

type DisplayBlockRow = {
    id: string;
    type: string;
    subtype?: string;
    content?: string;
    markdown?: string;
};

type BacklinkItem = {
    id: string;
    sourceBlockId: string;
    sourceRootId: string;
    type: string;
    content: string;
    refText: string;
    redirected?: {
        from: string;
        to: string;
        reason: RedirectReason;
    };
};

function normalizeLimit(value: unknown): number {
    if (value === undefined) return 64;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error('--limit must be a positive integer.');
    }
    return limit;
}

export const tool: ToolSchema = {
    id: 'search-backlinks',
    summary: 'List backlinks to a block with first-block redirect by default',
    tags: ['read', 'aggregate'],
    classification: { action: 'read', domain: 'content' },
    guard: { payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }] },
    input: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Referenced target block ID'
            },
            limit: {
                type: 'integer',
                description: 'Max raw backlink rows before redirect, default 64'
            },
            noRedirect: {
                type: 'boolean',
                description: 'Show exact referencing blocks instead of redirected navigation anchors. Default: false'
            }
        }
    },
    cli: {
        primary: 'id',
        examples: [
            { command: 'siyuan tool search-backlinks 20241016135347-zlrn2cz' },
            { command: 'siyuan tool search-backlinks 20241016135347-zlrn2cz --noRedirect true' }
        ]
    },
    async run(ctx, input) {
        const { id, noRedirect } = input as { id: string; limit?: number; noRedirect?: boolean };
        const limit = normalizeLimit((input as { limit?: number }).limit);

        const rows = await ctx.callEndpoint<BacklinkRow[]>('query.sql', {
            stmt: buildBacklinksSql(id, limit)
        });

        let treeInfos: Record<string, BlockTreeInfo> = {};
        if (!noRedirect && rows.length > 0) {
            treeInfos = await ctx.callEndpoint<Record<string, BlockTreeInfo>>('block.getBlockTreeInfos', {
                ids: rows.map((row) => row.sourceBlockId)
            });
        }

        const redirectTargets = rows.map((row) =>
            noRedirect ? { id: row.sourceBlockId } : resolveFirstBlockRedirect(row.sourceBlockId, treeInfos[row.sourceBlockId])
        );
        const displayRows = await ctx.callEndpoint<DisplayBlockRow[]>('query.sql', {
            stmt: buildBlocksByIdsSql(redirectTargets.map((target) => target.id))
        });
        const displayMap = new Map(displayRows.map((row) => [row.id, row]));

        const items: BacklinkItem[] = rows.map((row, index) => {
            const target = redirectTargets[index]!;
            const display = displayMap.get(target.id);
            const displayType = blockTypeLabel(display?.type ?? target.type ?? row.sourceType, display?.subtype ?? row.sourceSubtype);
            return {
                id: target.id,
                sourceBlockId: row.sourceBlockId,
                sourceRootId: row.sourceRootId,
                type: displayType,
                content: display?.content ?? row.sourceContent ?? row.sourceMarkdown ?? '',
                refText: row.refText ?? '',
                redirected: target.reason
                    ? { from: row.sourceBlockId, to: target.id, reason: target.reason }
                    : undefined
            };
        });

        const redirectedCount = items.filter((item) => item.redirected).length;
        const lines = [`backlinks=${items.length} redirected=${redirectedCount}`];
        for (const item of items) {
            lines.push(`- ${item.id} [${item.type}] "${previewText(item.content, SOURCE_PREVIEW_LIMIT)}"`);
            const redirectPart = item.redirected ? ` | ${item.redirected.reason}` : '';
            lines.push(`  from ${item.sourceBlockId}${redirectPart} | refText: ${previewText(item.refText, REF_TEXT_PREVIEW_LIMIT)}`);
        }

        return {
            content: lines.join('\n'),
            details: { target: id, backlinks: items }
        };
    }
};

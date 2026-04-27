import type { ToolSchema } from '../core/schema.js';
import { escapeSqliteLiteral } from '../utils/sql.js';

// ————— slice helpers —————

interface SliceBlock {
    id: string;
    type: string;
    markdown: string;
}

/**
 * Parse a slice syntax string and return the filtered subarray.
 *
 * Supported forms (blockList indexed from 0):
 *   "<ID>:+N"     — from ID (inclusive) forward N blocks
 *   "<ID>:-N"     — up to ID (inclusive) backward N blocks
 *   "<ID>:<ID>"   — closed ID range (inclusive both ends)
 *   "<ID>:END"    — from ID to last
 *   "BEGIN:<ID>"  — from first to ID
 *   "N:M"         — numeric slice (standard JS semantics, end exclusive)
 *   "-N:"         — last N blocks
 */
function applySlice(blockList: SliceBlock[], syntax: string): SliceBlock[] {
    if (!syntax.trim()) return blockList;

    const isSiyuanID = (s: string) => /^\d{14}-[0-9a-z]{7}$/.test(s);
    const findIndex = (id: string) => {
        const idx = blockList.findIndex((b) => b.id === id);
        if (idx === -1) throw new Error(`Slice: anchor ID '${id}' not found.`);
        return idx;
    };

    // "<ID>:+N" or "<ID>:-N"
    const rel = syntax.match(/^(.+):([+-])(\d+)$/);
    if (rel) {
        const [, anchor, sign, numStr] = rel;
        if (isSiyuanID(anchor!)) {
            const ai = findIndex(anchor!);
            const n = parseInt(numStr!, 10);
            if (sign === '+') return blockList.slice(ai, ai + n);
            const end = ai + 1;
            return blockList.slice(Math.max(0, end - n), end);
        }
    }

    const parts = syntax.split(':');
    if (parts.length !== 2) {
        // Single ID
        if (isSiyuanID(syntax)) {
            const idx = findIndex(syntax);
            return blockList.slice(idx, idx + 1);
        }
        // Single numeric
        if (/^-?\d+$/.test(syntax)) return blockList.slice(parseInt(syntax, 10));
        throw new Error(`Slice: unrecognized syntax '${syntax}'.`);
    }

    const [startRaw, endRaw] = parts.map((s) => s.trim());

    let start: number;
    if (!startRaw || startRaw === 'BEGIN') {
        start = 0;
    } else if (isSiyuanID(startRaw)) {
        start = findIndex(startRaw);
    } else {
        start = parseInt(startRaw, 10);
    }

    let end: number | undefined;
    if (!endRaw || endRaw === 'END') {
        end = undefined;
    } else if (isSiyuanID(endRaw)) {
        end = findIndex(endRaw) + 1; // closed interval
    } else {
        end = parseInt(endRaw, 10);
    }

    return blockList.slice(start, end);
}

// ————— tool —————

export const tool: ToolSchema = {
    id: 'get-block-content',
    summary: 'Read Markdown content of a block or document, with optional ID annotations and slice-based paging',
    description: `Reads the Markdown content of a block (paragraph, heading, container, or document).

**Modes**
- Default: returns the block's own Markdown.
- Document / heading / container blocks: always expands child blocks into a flat list.
- showId=true: prepends @@{id}@@ markers to each block for precise edit targeting.
- slice: paginates child blocks using range or cursor syntax (auto-enables showId).

**Slice syntax** (applies to document/container/heading child lists):
  "<LastID>:+10"  — next 10 blocks after cursor
  "<StartID>:<EndID>"  — closed ID range
  "0:20"           — first 20 blocks
  "-5:"            — last 5 blocks
  "<ID>:END"       — from ID to end`,
    tags: ['read'],
    input: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Block or document ID'
            },
            showId: {
                type: 'boolean',
                description: 'Prefix each child block with @@{blockId}@@{type} for edit targeting. Default: false (auto-enabled by slice)'
            },
            slice: {
                type: 'string',
                description:
                    'Optional slice syntax for paginating child blocks. Examples: "id1:+20", "id1:id2", "0:30", "-10:". Forces showId=true.'
            }
        }
    },
    cli: {
        primary: 'id',
        examples: [
            { command: 'siyuan tool get-block-content 20241016135347-zlrn2cz' },
            { command: 'siyuan tool get-block-content 20241016135347-zlrn2cz --showId true' },
            { command: 'siyuan tool get-block-content 20241016135347-zlrn2cz --slice "0:30"' },
            {
                command: 'siyuan tool get-block-content 20241016135347-zlrn2cz --slice "20241016135347-abcdefg:+20"',
                description: 'Continue reading from a known cursor block'
            }
        ]
    },
    async run(ctx, input) {
        const { id, slice } = input as { id: string; slice?: string };
        const forceShowId = !!slice;
        const showId = forceShowId || ((input as { showId?: boolean }).showId ?? false);

        // Look up the target block from SQL (we need type info)
        const rootRows = await ctx.callEndpoint<
            { id: string; type: string; subtype: string; markdown: string; content: string }[]
        >('query.sql', {
            stmt: `SELECT id, type, subtype, markdown, content FROM blocks WHERE id = '${escapeSqliteLiteral(id)}' LIMIT 1`
        });

        if (rootRows.length === 0) throw new Error(`Block not found: ${id}`);
        const root = rootRows[0]!;

        const isDocument = root.type === 'd';
        const isHeading = root.type === 'h';
        // Container blocks: document, blockquote, list, list-item, superblock
        const isContainer = ['d', 'b', 'l', 'i', 's'].includes(root.type);
        const needExpand = isDocument || isHeading || isContainer;

        let blocks: SliceBlock[];

        if (needExpand) {
            // Use getChildBlocks (kernel API) which returns markdown and correct order,
            // handling heading-as-logical-container properly.
            const children = await ctx.callEndpoint<
                { id: string; type: string; subType?: string; markdown: string }[]
            >('block.getChildBlocks', { id });

            blocks = children.map((c) => ({
                id: c.id,
                type: c.type + (c.subType ? '/' + c.subType : ''),
                markdown: c.markdown ?? ''
            }));

            // For heading blocks, prepend the heading itself
            if (isHeading) {
                blocks.unshift({
                    id: root.id,
                    type: root.type + (root.subtype ? '/' + root.subtype : ''),
                    markdown: root.markdown ?? ''
                });
            }
        } else {
            blocks = [{ id: root.id, type: root.type + (root.subtype ? '/' + root.subtype : ''), markdown: root.markdown ?? '' }];
        }

        // Apply slice if requested
        let sliceInfo = '';
        if (slice && blocks.length > 0) {
            const originalCount = blocks.length;
            try {
                blocks = applySlice(blocks, slice);
            } catch (e: unknown) {
                throw new Error(`Slice error: ${(e as Error).message}`);
            }
            if (blocks.length === 0) {
                return {
                    content: `(Slice "${slice}" returned 0 blocks. Original child count: ${originalCount}. Check your range.)`,
                    details: { id, sliceEmpty: true, originalCount }
                };
            }
            sliceInfo = `> [Slice] filter="${slice}" | showing ${blocks.length} of ${originalCount} child blocks\n\n`;
        }

        // Render output
        const rendered = showId
            ? blocks.map((b) => `@@${b.id}@@${b.type}\n${b.markdown ?? ''}`).join('\n\n')
            : blocks.map((b) => b.markdown ?? '').join('\n\n');

        const content = sliceInfo + rendered;

        return {
            content,
            details: {
                id,
                blockType: root.type,
                expanded: needExpand,
                blockCount: blocks.length,
                showId,
                slice: slice ?? null
            }
        };
    }
};

import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

interface BlockUpdate {
    id: string;
    data: string;
}

export const tool: ToolSchema = {
    id: 'update-block',
    summary: 'Update block content (preserves custom attributes)',
    description: `Wraps block.batchUpdateBlock with automatic custom-attribute preservation.
The kernel updateBlock API erases all custom-* attributes on the target block.
This tool reads custom attrs before updating, then writes them back after.

Input: JSON array of {id, data} objects. dataType is always markdown.
Supports --dry-run to preview which blocks exist and what attrs would be preserved.`,
    tags: ['write'],
    classification: { action: 'write', domain: 'content' },
    input: {
        type: 'object',
        required: ['blocks'],
        additionalProperties: false,
        properties: {
            blocks: {
                type: 'string',
                description:
                    'JSON array of {id, data} objects. Each id is a block ID, data is new markdown content.'
            }
        }
    },
    cli: {
        allowSource: { blocks: ['literal', 'file', 'stdin'] },
        examples: [
            {
                command:
                    "siyuan tool update-block --blocks @stdin <<'EOF'\n[{\"id\":\"20241016135347-zlrn2cz\",\"data\":\"New content\"}]\nEOF",
                description: 'Update a single block via heredoc'
            },
            {
                command: 'siyuan tool update-block --blocks @file:./updates.json',
                description: 'Batch update from file'
            }
        ]
    },
    run: async (ctx, input) => {
        const { blocks: blocksJson } = input as { blocks: string };

        // 1. Parse and validate input
        let parsed: unknown;
        try {
            parsed = JSON.parse(blocksJson);
        } catch {
            throw new Error('Invalid JSON in --blocks input.');
        }
        if (!Array.isArray(parsed)) {
            throw new Error('--blocks must be a JSON array.');
        }
        const blocks: BlockUpdate[] = [];
        for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];
            if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.data !== 'string') {
                throw new Error(`blocks[${i}]: must have string "id" and "data" fields.`);
            }
            blocks.push({ id: item.id, data: item.data });
        }
        if (blocks.length === 0) {
            return { content: 'No blocks to update.', details: { updated: [] }, warnings: ['Empty input array.'] };
        }

        const ids = blocks.map((b) => b.id);

        // 1b. Early permission check — reject before any network calls
        for (const id of ids) {
            await ctx.permission.checkContentRef(
                { kind: 'id', value: id, access: 'read' },
                { tool: 'update-block' }
            );
            await ctx.permission.checkContentRef(
                { kind: 'id', value: id, access: 'write' },
                { tool: 'update-block' }
            );
        }

        // 2. Check block existence via SQL
        const idList = ids.map((id) => `'${escapeSqliteLiteral(id)}'`).join(',');
        const existingRows = await ctx.callEndpoint<{ id: string }[]>(
            'query.sql',
            { stmt: `SELECT id FROM blocks WHERE id IN (${idList})` },
            { bypassPermission: true }
        );
        const existingIds = new Set(existingRows.map((r) => r.id));
        const missingIds = ids.filter((id) => !existingIds.has(id));
        if (missingIds.length > 0) {
            throw new Error(`Block(s) not found: ${missingIds.join(', ')}`);
        }

        // 3. Read existing custom attrs
        const attrsResponse = await ctx.callEndpointRaw<Record<string, Record<string, string>>>(
            '/api/attr/batchGetBlockAttrs',
            { ids }
        );
        const savedCustom = new Map<string, Record<string, string>>();
        for (const [id, attrs] of Object.entries(attrsResponse)) {
            const custom = extractCustomAttrs(attrs);
            if (custom) savedCustom.set(id, custom);
        }

        // 4. Dry-run: report what would happen
        if (ctx.args.dryRun) {
            const preview = ids.map((id) => ({
                id,
                exists: true,
                customAttrs: savedCustom.get(id) ? Object.keys(savedCustom.get(id)!) : []
            }));
            const withAttrs = preview.filter((p) => p.customAttrs.length > 0).length;
            return {
                content: `[dry-run] Would update ${blocks.length} block(s) (${withAttrs} with custom attrs to preserve).`,
                details: { dryRun: true, blocks: preview }
            };
        }

        // 5. Update blocks
        await ctx.callEndpoint('block.batchUpdateBlock', {
            blocks: blocks.map((b) => ({ id: b.id, data: b.data, dataType: 'markdown' }))
        });

        // 6. Restore custom attrs
        if (savedCustom.size > 0) {
            const blockAttrs = [...savedCustom.entries()].map(([id, attrs]) => ({ id, attrs }));
            await ctx.callEndpointRaw('/api/attr/batchSetBlockAttrs', { blockAttrs });
        }

        // 7. Result
        const updated = ids.map((id) => ({
            id,
            attrsPreserved: savedCustom.get(id) ? Object.keys(savedCustom.get(id)!).length : 0
        }));
        const withAttrs = updated.filter((u) => u.attrsPreserved > 0).length;

        return {
            content: `Updated ${blocks.length} block(s) (${withAttrs} with attrs preserved).`,
            details: { updated }
        };
    }
};

function extractCustomAttrs(attrs: Record<string, string>): Record<string, string> | null {
    const custom: Record<string, string> = {};
    let hasAny = false;
    for (const [k, v] of Object.entries(attrs)) {
        if (k.startsWith('custom-')) {
            custom[k] = v;
            hasAny = true;
        }
    }
    return hasAny ? custom : null;
}

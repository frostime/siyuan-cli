import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

type DocRow = {
    id: string;
    box: string;
    path: string;
    hpath: string;
    content: string;
    type: string;
};

type BlockRow = {
    id: string;
    parent_id: string;
    root_id: string;
    box: string;
    path: string;
    hpath: string;
    type: string;
    subtype: string;
    content: string;
    markdown: string;
    sort: number;
};

type AttrRow = {
    block_id: string;
    name: string;
    value: string;
};

type InboundRefRow = {
    block_id: string;
    root_id: string;
    def_block_id: string;
    content: string;
    markdown: string;
    hpath: string;
};

type OutboundRefRow = {
    block_id: string;
    root_id: string;
    def_block_id: string;
    def_block_root_id: string;
    content: string;
    markdown: string;
};

const PREVIEW_LIMIT = 160;

function preview(text: string | undefined, limit = PREVIEW_LIMIT): string {
    const flat = (text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length <= limit ? flat : flat.slice(0, limit) + '…';
}

function timestampForPath(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function groupAttrs(rows: AttrRow[], blockMap: Map<string, BlockRow>) {
    const groups = new Map<string, Record<string, string>>();
    for (const row of rows) {
        if (!groups.has(row.block_id)) groups.set(row.block_id, {});
        groups.get(row.block_id)![row.name] = row.value;
    }
    return [...groups.entries()].map(([blockId, attrs]) => {
        const block = blockMap.get(blockId);
        return {
            blockId,
            type: block?.type ?? '',
            subtype: block?.subtype ?? '',
            contentPreview: preview(block?.content || block?.markdown),
            attrs
        };
    });
}

function groupRefsByTarget(rows: InboundRefRow[], blockMap: Map<string, BlockRow>) {
    const groups = new Map<string, InboundRefRow[]>();
    for (const row of rows) {
        if (!groups.has(row.def_block_id)) groups.set(row.def_block_id, []);
        groups.get(row.def_block_id)!.push(row);
    }
    return [...groups.entries()].map(([targetBlockId, refBy]) => {
        const target = blockMap.get(targetBlockId);
        return {
            targetBlockId,
            targetPreview: preview(target?.content || target?.markdown),
            refBy: refBy.map((ref) => ({
                blockId: ref.block_id,
                rootId: ref.root_id,
                hpath: ref.hpath,
                contentPreview: preview(ref.content || ref.markdown)
            }))
        };
    });
}

function renderReadme(): string {
    return `# SiYuan Document Checkpoint

This is a document-level recovery package, not a SiYuan repo snapshot.

Files:
- content.kramdown.md: original document content with block ids and IAL.
- recovery.json: custom attrs and block reference relationships.

Use:
1. Re-read the live document before recovery.
2. Map old blocks to new blocks by contentPreview / heading context.
3. Restore custom attrs with attr.setBlockAttrs.
4. Restore external inbound refs or internal refs with block.transferBlockRef when old/new target ids are known.
`;
}

export const tool: ToolSchema = {
    id: 'checkpoint-doc',
    summary: 'Create a document-level recovery checkpoint for high-risk edits',
    description: `Writes a local recovery package for one SiYuan document.

This is not a SiYuan repo snapshot. It stores the document Kramdown plus
custom attributes and block reference relationships so an agent can recover
important metadata if a high-risk edit rewrites child block IDs.`,
    tags: ['read', 'util'],
    input: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document ID to checkpoint',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            outDir: {
                type: 'string',
                description: 'Optional parent output directory. Defaults to system temp/agent-temp/siyuan-cli/checkpoints.'
            }
        }
    },
    cli: {
        primary: 'id',
        examples: [
            { command: 'siyuan tool checkpoint-doc 20241016135347-zlrn2cz' },
            { command: 'siyuan tool checkpoint-doc 20241016135347-zlrn2cz --outDir ./checkpoints' }
        ]
    },
    async run(ctx, input) {
        const { id, outDir } = input as { id: string; outDir?: string };
        const escapedId = escapeSqliteLiteral(id);

        const docRows = await ctx.callEndpoint<DocRow[]>('query.sql', {
            stmt: `SELECT id, box, path, hpath, content, type FROM blocks WHERE id = '${escapedId}' LIMIT 1`
        });
        if (docRows.length === 0) throw new Error(`Document not found: ${id}`);
        const doc = docRows[0]!;
        if (doc.type !== 'd') throw new Error(`checkpoint-doc only works on documents (type=d), got type=${doc.type}.`);

        const kramdown = await ctx.callEndpoint<{ id: string; kramdown: string }>('block.getBlockKramdown', { id });

        const blocks = await ctx.callEndpoint<BlockRow[]>('query.sql', {
            stmt: `SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, sort
                FROM blocks
                WHERE root_id = '${escapedId}'
                ORDER BY sort ASC
                LIMIT 100000`
        });
        const blockMap = new Map(blocks.map((block) => [block.id, block]));
        const blockIdsSql = blocks.map((block) => `'${escapeSqliteLiteral(block.id)}'`).join(',');

        const customAttrRows = blockIdsSql
            ? await ctx.callEndpoint<AttrRow[]>('query.sql', {
                  stmt: `SELECT block_id, name, value
                    FROM attributes
                    WHERE block_id IN (${blockIdsSql}) AND name LIKE 'custom-%'
                    ORDER BY block_id, name
                    LIMIT 100000`
              })
            : [];

        const refTargetRows = blockIdsSql
            ? await ctx.callEndpoint<InboundRefRow[]>('query.sql', {
                  stmt: `SELECT r.block_id, r.root_id, r.def_block_id, r.content, r.markdown, b.hpath
                    FROM refs r
                    LEFT JOIN blocks b ON b.id = r.block_id
                    WHERE r.def_block_id IN (${blockIdsSql})
                    ORDER BY r.def_block_id, r.block_id
                    LIMIT 100000`
              })
            : [];
        const inboundRows = refTargetRows.filter((row) => row.root_id !== id);
        const internalRows = refTargetRows.filter((row) => row.root_id === id);

        const outboundRows = await ctx.callEndpoint<OutboundRefRow[]>('query.sql', {
            stmt: `SELECT block_id, root_id, def_block_id, def_block_root_id, content, markdown
                FROM refs
                WHERE root_id = '${escapedId}'
                ORDER BY block_id
                LIMIT 100000`
        });

        const createdAt = new Date().toISOString();
        const parentDir = resolve(outDir ?? join(tmpdir(), 'agent-temp', 'siyuan-cli', 'checkpoints'));
        const checkpointDir = join(parentDir, `${timestampForPath()}-${id}`);

        const recovery = {
            checkpointVersion: 1,
            createdAt,
            document: {
                id: doc.id,
                box: doc.box,
                path: doc.path,
                hpath: doc.hpath,
                title: doc.content
            },
            blocks: blocks.map((block) => ({
                id: block.id,
                type: block.type,
                subtype: block.subtype,
                parentId: block.parent_id,
                rootId: block.root_id,
                sort: block.sort,
                contentPreview: preview(block.content),
                markdownPreview: preview(block.markdown)
            })),
            customAttrs: groupAttrs(customAttrRows, blockMap),
            refs: {
                inbound: groupRefsByTarget(inboundRows, blockMap),
                internal: groupRefsByTarget(internalRows, blockMap),
                outbound: outboundRows.map((ref) => ({
                    sourceBlockId: ref.block_id,
                    sourcePreview: preview(ref.content || ref.markdown),
                    targetBlockId: ref.def_block_id,
                    targetRootId: ref.def_block_root_id,
                    anchor: ref.content
                }))
            }
        };

        const contentPath = join(checkpointDir, 'content.kramdown.md');
        const recoveryPath = join(checkpointDir, 'recovery.json');
        const readmePath = join(checkpointDir, 'README.md');

        const stats = {
            blockCount: blocks.length,
            customAttrBlockCount: recovery.customAttrs.length,
            inboundRefCount: inboundRows.length,
            internalRefCount: internalRows.length,
            outboundRefCount: outboundRows.length
        };

        const files = {
            content: contentPath,
            recovery: recoveryPath,
            readme: readmePath
        };

        if (ctx.args.dryRun) {
            return {
                content: `DRY RUN: would write checkpoint to ${checkpointDir}\n\nFiles:\n- content.kramdown.md\n- recovery.json\n- README.md\n\nStats:\n- blocks: ${stats.blockCount}\n- custom attr blocks: ${stats.customAttrBlockCount}\n- inbound refs: ${stats.inboundRefCount}\n- internal refs: ${stats.internalRefCount}\n- outbound refs: ${stats.outboundRefCount}`,
                details: {
                    dryRun: true,
                    dir: checkpointDir,
                    files,
                    stats
                }
            };
        }

        await mkdir(checkpointDir, { recursive: true });
        await writeFile(contentPath, kramdown.kramdown, 'utf8');
        await writeFile(recoveryPath, JSON.stringify(recovery, null, 2) + '\n', 'utf8');
        await writeFile(readmePath, renderReadme(), 'utf8');

        return {
            content: `Checkpoint written: ${checkpointDir}\n\nFiles:\n- content.kramdown.md\n- recovery.json\n- README.md\n\nStats:\n- blocks: ${stats.blockCount}\n- custom attr blocks: ${stats.customAttrBlockCount}\n- inbound refs: ${stats.inboundRefCount}\n- internal refs: ${stats.internalRefCount}\n- outbound refs: ${stats.outboundRefCount}`,
            details: {
                dir: checkpointDir,
                files,
                stats
            }
        };
    }
};

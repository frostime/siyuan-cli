import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

export const tool: ToolSchema = {
    id: 'brute-edit',
    summary:
        'Full-document text search-and-replace (rewrites document, regenerates child block IDs)',
    description: `Reads a document's entire Markdown content, applies multiple search→replace
operations against the ORIGINAL text positions, then writes back via block.updateBlock.

⚠️ Child block IDs ARE regenerated. Only safe when:
  1. No child block has custom-* attributes
  2. No child block is referenced by other documents/blocks
  3. Document total markdown is under the size limit (default 50KB)

⚠️ Each search string MUST appear exactly once in the document.
If a search matches 0 times, multiple times, or overlaps with another, the entire
operation is rejected.

Uses global --dry-run to preview without writing.`,
    tags: ['write'],
    input: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document ID to edit',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            replacements: {
                type: 'string',
                description:
                    'JSON array of {search, replace} pairs. Required unless --check true. E.g.: \'[{"search":"old","replace":"new"}]\''
            },
            check: {
                type: 'boolean',
                description: 'Only check whether the document is safe for brute-edit; does not require replacements.',
                default: false
            },
            maxSize: {
                type: 'integer',
                description: 'Maximum total markdown size in bytes (default: 51200 = 50KB)',
                default: 51200
            }
        }
    },
    cli: {
        primary: 'id',
        allowSource: {
            replacements: ['literal', 'file', 'stdin']
        },
        examples: [
            {
                command:
                    'siyuan tool brute-edit 20241016135347-zlrn2cz --replacements \'[{"search":"old","replace":"new"}]\''
            },
            {
                command: 'siyuan tool brute-edit 20241016135347-zlrn2cz --replacements @file:./replacements.json'
            },
            {
                command: 'cat replacements.json | siyuan tool brute-edit 20241016135347-zlrn2cz --replacements @stdin'
            },
            {
                command: 'siyuan tool brute-edit 20241016135347-zlrn2cz --replacements \'[...]\' --maxSize 102400'
            },
            {
                command: 'siyuan tool brute-edit 20241016135347-zlrn2cz --check true'
            }
        ]
    },

    async run(ctx, input) {
        const { id, maxSize, replacements, check } = input as { id: string; maxSize?: number; replacements?: string; check?: boolean };
        const dryRun = ctx.args.dryRun;
        const maxBytes = maxSize ?? 51200;
        const checkOnly = check ?? false;

        let pairs: Array<{ search: string; replace: string }> = [];
        if (!checkOnly) {
            if (!replacements) throw new Error('replacements is required unless --check true.');
            try {
                pairs = JSON.parse(replacements);
                if (!Array.isArray(pairs) || pairs.length === 0) {
                    throw new Error('replacements must be a non-empty JSON array.');
                }
                for (const p of pairs) {
                    if (typeof p.search !== 'string' || typeof p.replace !== 'string') {
                        throw new Error('Each replacement must have string "search" and "replace".');
                    }
                }
            } catch (e: unknown) {
                if (e instanceof SyntaxError) {
                    throw new Error(`Invalid replacements JSON: ${(e as Error).message}`);
                }
                throw e;
            }
        }

        // STEP 1: Verify document
        const docRows = await ctx.callEndpoint<
            Array<{ id: string; type: string }>
        >('query.sql', {
            stmt: `SELECT id, type FROM blocks WHERE id = '${escapeSqliteLiteral(id)}' LIMIT 1`
        });
        if (docRows.length === 0) {
            return errorResult('not-found', `Document not found: ${id}`, {
                hint: 'Check the document ID.'
            });
        }
        if (docRows[0]!.type !== 'd') {
            return errorResult(
                'not-document',
                `${id} is type='${docRows[0]!.type}', not a document`,
                { hint: 'brute-edit only works on documents (type=d).' }
            );
        }

        // STEP 2: Safety — custom-* attributes
        const customRows = await ctx.callEndpoint<
            Array<{ id: string; name: string; value: string }>
        >('query.sql', {
            stmt: `SELECT a.block_id AS id, a.name, a.value FROM attributes a
                    JOIN blocks b ON a.block_id = b.id
                    WHERE b.root_id = '${escapeSqliteLiteral(id)}' AND b.type != 'd' AND a.name LIKE 'custom-%'
                    LIMIT 1000`
        });

        // STEP 3: Safety — inbound refs
        const refRows = await ctx.callEndpoint<Array<{ def_block_id: string }>>('query.sql', {
            stmt: `SELECT DISTINCT r.def_block_id FROM refs r
                    WHERE r.def_block_id IN (
                      SELECT id FROM blocks WHERE root_id = '${escapeSqliteLiteral(id)}' AND type != 'd'
                    ) LIMIT 1000`
        });

        // STEP 4: Read markdown + size check
        const children = await ctx.callEndpoint<
            Array<{ id: string; type: string; subType?: string; markdown: string }>
        >('block.getChildBlocks', { id });
        const markdown = children.map((c) => c.markdown ?? '').join('\n\n');
        const byteLength = Buffer.byteLength(markdown, 'utf8');
        const blockingReasons = [
            ...(customRows.length > 0 ? ['custom-attrs'] : []),
            ...(refRows.length > 0 ? ['inbound-refs'] : []),
            ...(byteLength > maxBytes ? ['size-limit'] : [])
        ];
        const safety = {
            safeForBruteEdit: blockingReasons.length === 0,
            blockingReasons,
            customAttrBlocks: customRows,
            inboundRefBlocks: refRows,
            doc: {
                id,
                childBlockCount: children.length,
                byteLength,
                maxSize: maxBytes
            }
        };

        if (checkOnly) {
            return {
                content: safety.safeForBruteEdit
                    ? `SAFE: document ${id} can use brute-edit (${byteLength} bytes, ${children.length} child blocks)`
                    : `UNSAFE: document ${id} should not use brute-edit (${blockingReasons.join(', ')})`,
                details: safety
            };
        }

        if (customRows.length > 0) {
            return errorResult('custom-attrs', 'SAFETY CHECK FAILED — child blocks have custom attributes', {
                canApply: false,
                ...safety,
                hint: 'Use a non-destructive approach (block.updateBlock on individual blocks), or checkpoint and restore attributes deliberately.'
            });
        }
        if (refRows.length > 0) {
            return errorResult('inbound-refs', 'SAFETY CHECK FAILED — child blocks have inbound references', {
                canApply: false,
                ...safety,
                hint: 'Use a non-destructive approach (block.updateBlock on individual blocks), or checkpoint and transfer refs deliberately.'
            });
        }
        if (byteLength > maxBytes) {
            return errorResult('size-limit', `SIZE LIMIT EXCEEDED: ${byteLength} bytes (max: ${maxBytes})`, {
                canApply: false,
                ...safety,
                actual: byteLength,
                max: maxBytes
            });
        }

        // STEP 5: Search uniqueness + match planning on ORIGINAL markdown
        interface PlannedReplacement {
            search: string;
            replace: string;
            start: number;
            end: number;
        }

        const planned: PlannedReplacement[] = [];
        for (const { search, replace } of pairs) {
            const first = markdown.indexOf(search);
            if (first === -1) {
                return errorResult('search-not-found', `PRE-CHECK FAILED: Search string not found`, {
                    canApply: false,
                    ...safety,
                    reason: 'search-not-found',
                    search,
                    hint: 'Check spelling or use a broader search.'
                });
            }
            const second = markdown.indexOf(search, first + 1);
            if (second !== -1) {
                // Count total occurrences for message
                let count = 1;
                let pos = second;
                while (pos !== -1) {
                    count++;
                    pos = markdown.indexOf(search, pos + 1);
                }
                return errorResult(
                    'search-ambiguous',
                    `PRE-CHECK FAILED: Search string matches ${count} times`,
                    {
                        canApply: false,
                        ...safety,
                        reason: 'search-ambiguous',
                        search,
                        matchCount: count,
                        hint: 'Use a more specific search string.'
                    }
                );
            }
            planned.push({ search, replace, start: first, end: first + search.length });
        }

        // Check for overlapping ranges
        const sorted = [...planned].sort((a, b) => a.start - b.start);
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i]!.start < sorted[i - 1]!.end) {
                return errorResult(
                    'overlapping-replacements',
                    'PRE-CHECK FAILED: Replacement ranges overlap in original document',
                    {
                        canApply: false,
                        ...safety,
                        reason: 'overlapping-replacements',
                        conflicts: [
                            { search: sorted[i - 1]!.search, range: [sorted[i - 1]!.start, sorted[i - 1]!.end] },
                            { search: sorted[i]!.search, range: [sorted[i]!.start, sorted[i]!.end] }
                        ],
                        hint: 'Split the edit into separate calls or make the search strings non-overlapping.'
                    }
                );
            }
        }

        // STEP 6: Apply replacements by original match spans (end-to-start)
        let result = markdown;
        const sortedDesc = [...planned].sort((a, b) => b.start - a.start);
        for (const { replace, start, end } of sortedDesc) {
            result = result.slice(0, start) + replace + result.slice(end);
        }

        const plannedWithContext = planned.map((item) => ({
            search: item.search,
            replace: item.replace,
            start: item.start,
            end: item.end,
            beforeContext: markdown.slice(Math.max(0, item.start - 80), item.start),
            afterContext: markdown.slice(item.end, Math.min(markdown.length, item.end + 80))
        }));

        // STEP 7: dryRun check
        if (dryRun) {
            return {
                content: `DRY RUN: ${planned.length} replacements would be applied to document ${id} (${byteLength} bytes)`,
                details: {
                    canApply: true,
                    ...safety,
                    replacements: plannedWithContext,
                    replacementCount: planned.length,
                    dryRun: true
                }
            };
        }

        // STEP 8: Write back
        await ctx.callEndpoint('block.updateBlock', {
            id,
            data: result,
            dataType: 'markdown'
        });

        const newByteLength = Buffer.byteLength(result, 'utf8');
        return {
            content: `Replaced in document ${id}: ${planned.length} replacements, ${newByteLength} bytes`,
            details: {
                canApply: true,
                docId: id,
                replacementCount: planned.length,
                byteLength: newByteLength
            }
        };
    }
};

function errorResult(reason: string, content: string, details: Record<string, unknown>) {
    return { content, details: { reason, ...details } };
}
import { filterIdKeyedMap } from '@/api/response-guards.js';
import { inlineValue } from '@/shared/output.js';
import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<BatchGetBlockAttrsData> = {
    endpoint: '/api/attr/batchGetBlockAttrs',
    summary: 'Batch get block attributes',
    payload: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
            ids: {
                type: 'array',
                description: 'Block IDs',
                items: {
                    type: 'string',
                    pattern: '^\\d{14}-[0-9a-z]{7}$'
                }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'batch',
        operation: 'inspect'
    },
    cli: {
        allowSource: { ids: ['literal', 'file', 'stdin'] },
        examples: [
            {
                command: 'siyuan api attr.batchGetBlockAttrs --ids @file:./ids.json',
                description: 'ids.json contains an array of block IDs'
            }
        ]
    },
    guard: {
        payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }],
        filterResponse: async (response, engine, context) =>
            await filterIdKeyedMap(
                response as BatchGetBlockAttrsData,
                engine,
                context
            )
    },
    format: ({ responseData }) => formatBatchGetBlockAttrs(responseData)
};

export type BlockAttrs = Record<string, string | null>;

export type BatchGetBlockAttrsData = Record<string, BlockAttrs>;

export interface BatchGetBlockAttrsResponse {
    code: number;
    msg: string;
    data: BatchGetBlockAttrsData;
}

function formatBatchGetBlockAttrs(data: BatchGetBlockAttrsData): string {
    const entries = Object.entries(data);
    if (entries.length === 0) return '0 blocks';
    const blocks = entries.map(([id, attrs]) => {
        const lines = [`--- id: ${id}`];
        const keys = Object.keys(attrs).filter((key) => key !== 'id');
        for (const key of keys) {
            lines.push(`${key}: ${inlineValue(attrs[key])}`);
        }
        return lines.join('\n');
    });
    return [`${entries.length} blocks`, ...blocks].join('\n\n');
}

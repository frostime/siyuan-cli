import type { EndpointSchema } from '@/shared/schema.js';
import type { BlockTransaction } from './transaction.js';

const batchBlockItem = {
    type: 'object' as const,
    required: ['data', 'dataType', 'parentID'],
    additionalProperties: false,
    properties: {
        data: { type: 'string' as const, description: 'Content to append' },
        dataType: {
            type: 'string' as const,
            enum: ['markdown', 'dom'],
            default: 'markdown',
            description: 'Content type; use markdown by default'
        },
        parentID: {
            type: 'string' as const,
            description: 'Parent block/document ID',
            pattern: '^\\d{14}-[0-9a-z]{7}$'
        }
    }
};

export const schema: EndpointSchema<BlockTransaction[]> = {
    endpoint: '/api/block/batchAppendBlock',
    summary: 'Batch append blocks to parents',
    payload: {
        type: 'object',
        required: ['blocks'],
        additionalProperties: false,
        properties: {
            blocks: {
                type: 'array',
                description: 'Blocks to append',
                items: batchBlockItem
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'batch',
        operation: 'create'
    },
    cli: { allowSource: { blocks: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'blocks[*].parentID', kind: 'id', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

export interface BatchAppendBlockResponse {
    code: number;
    msg: string;
    data: BlockTransaction[];
}

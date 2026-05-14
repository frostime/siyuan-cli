import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/updateBlock',
    summary: 'Update block content',
    payload: {
        type: 'object',
        required: ['dataType', 'data', 'id'],
        additionalProperties: false,
        properties: {
            dataType: {
                type: 'string',
                enum: ['markdown', 'dom'],
                default: 'markdown',
                description: 'Content type'
            },
            data: { type: 'string', description: 'New content' },
            id: {
                type: 'string',
                description: 'Block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        action: 'write',
        domain: 'content',
        cardinality: 'single',
    },
    cli: { allowSource: { data: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

/**
 * Update operation
 */
export interface UpdateOperation {
    action: string;
    data: string;
    id: string;
}

/**
 * Update transaction
 */
export interface UpdateTransaction {
    timestamp: number;
    doOperations: UpdateOperation[];
    undoOperations: null;
}

/**
 * Response data type for updateBlock
 */
export interface UpdateBlockResponse {
    code: number;
    msg: string;
    data: UpdateTransaction[];
}

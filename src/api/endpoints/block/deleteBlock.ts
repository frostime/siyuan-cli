import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/deleteBlock',
    summary: 'Delete block',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
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
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

/**
 * Operation in delete transaction
 */
export interface DeleteOperation {
    action: string;
    data: null;
    id: string;
}

/**
 * Delete transaction
 */
export interface DeleteTransaction {
    timestamp: number;
    doOperations: DeleteOperation[];
    undoOperations: null;
}

/**
 * Response data type for deleteBlock
 */
export interface DeleteBlockResponse {
    code: number;
    msg: string;
    data: DeleteTransaction[];
}

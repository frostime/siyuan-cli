import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/appendBlock',
    summary: 'Append blocks to parent',
    payload: {
        type: 'object',
        required: ['data', 'parentID'],
        additionalProperties: false,
        properties: {
            dataType: {
                type: 'string',
                enum: ['markdown', 'dom'],
                default: 'markdown',
                description: 'Content type (optional, defaults to markdown; prefer markdown for agents)'
            },
            data: { type: 'string', description: 'Content to append' },
            parentID: {
                type: 'string',
                description: 'Parent block/document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'create'
    },
    cli: { allowSource: { data: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'parentID', kind: 'id', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

/**
 * Operation in transaction
 */
export interface BlockOperation {
    action: string;
    data: string;
    id: string;
    parentID: string;
}

/**
 * Transaction in response
 */
export interface BlockTransaction {
    timestamp: number;
    doOperations: BlockOperation[];
    undoOperations: null;
}

/**
 * Response data type for appendBlock
 */
export interface AppendBlockResponse {
    code: number;
    msg: string;
    data: BlockTransaction[];
}

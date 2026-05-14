import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/insertBlock',
    summary: 'Insert blocks before, after, or as child of specified block',
    payload: {
        type: 'object',
        additionalProperties: false,
        properties: {
            dataType: {
                type: 'string',
                enum: ['markdown', 'dom'],
                default: 'markdown',
                description: 'Content type'
            },
            data: { type: 'string', description: 'Content to insert' },
            nextID: {
                type: 'string',
                description: 'Next block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            previousID: {
                type: 'string',
                description: 'Previous block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            parentID: {
                type: 'string',
                description: 'Parent block ID',
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
        payloadTargets: [
            { path: 'nextID', kind: 'id', access: 'write' },
            { path: 'previousID', kind: 'id', access: 'write' },
            { path: 'parentID', kind: 'id', access: 'write' }
        ]
    },
    formatStrategy: 'transaction'
};

/**
 * Insert operation
 */
export interface InsertOperation {
    action: string;
    data: string;
    id: string;
    nextID: string;
    previousID: string;
    parentID: string;
}

/**
 * Insert transaction
 */
export interface InsertTransaction {
    timestamp: number;
    doOperations: InsertOperation[];
    undoOperations: null;
}

/**
 * Response data type for insertBlock
 */
export interface InsertBlockResponse {
    code: number;
    msg: string;
    data: InsertTransaction[];
}

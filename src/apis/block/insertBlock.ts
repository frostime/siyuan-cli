import type { EndpointSchema } from '../../core/schema.js';

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['timestamp', 'doOperations', 'undoOperations'],
                    properties: {
                        timestamp: { type: 'integer', description: 'timestamp' },
                        doOperations: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['action', 'data', 'id', 'nextID', 'previousID', 'parentID'],
                                properties: {
                                    action: { type: 'string', description: 'operation action type' },
                                    data: { type: 'string', description: 'HTML DOM of inserting blocks' },
                                    id: { type: 'string', description: 'block ID' },
                                    nextID: { type: 'string', description: 'next block ID' },
                                    previousID: { type: 'string', description: 'previous block ID' },
                                    parentID: { type: 'string', description: 'parent block ID' }
                                }
                            }
                        },
                        undoOperations: { type: 'null', description: 'undo operation list' }
                    }
                }
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
        payloadTargets: [
            { path: 'nextID', kind: 'id', access: 'write' },
            { path: 'previousID', kind: 'id', access: 'write' },
            { path: 'parentID', kind: 'id', access: 'write' }
        ]
    }
};

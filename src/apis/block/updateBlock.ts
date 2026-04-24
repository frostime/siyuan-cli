import type { EndpointSchema } from '../../core/schema.js';

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
                                required: ['action', 'data', 'id'],
                                properties: {
                                    action: { type: 'string', description: 'operation action type' },
                                    data: { type: 'string', description: 'HTML DOM of updating blocks' },
                                    id: { type: 'string', description: 'ID of the block to be updated' }
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
        operation: 'update'
    },
    cli: { allowSource: { data: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    }
};

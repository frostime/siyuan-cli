import type { EndpointSchema } from '../../core/schema.js';

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
                description: '块 ID',
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
                                    data: { type: 'null', description: 'HTML DOM of updating blocks' },
                                    id: { type: 'string', description: 'ID of the block to be deleted' }
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
        operation: 'delete'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    }
};

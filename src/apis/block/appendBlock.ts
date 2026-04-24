import type { EndpointSchema } from '../../core/schema.js';

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

export const schema: EndpointSchema = {
    endpoint: '/api/block/appendBlock',
    summary: 'Append blocks to parent',
    payload: {
        type: 'object',
        required: ['dataType', 'data', 'parentID'],
        additionalProperties: false,
        properties: {
            dataType: {
                type: 'string',
                enum: ['markdown', 'dom'],
                default: 'markdown',
                description: 'Content type'
            },
            data: { type: 'string', description: 'Content to append' },
            parentID: {
                type: 'string',
                description: 'Parent block/document ID',
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
                                required: ['action', 'data', 'id', 'parentID'],
                                properties: {
                                    action: { type: 'string', description: 'operation action type' },
                                    data: { type: 'string', description: 'HTML DOM of inserting blocks' },
                                    id: { type: 'string', description: 'block ID' },
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
        payloadTargets: [{ path: 'parentID', kind: 'id', access: 'write' }]
    }
};

import type { EndpointSchema } from '../../core/schema.js';

/**
 * Prepend operation
 */
export interface PrependOperation {
    action: string;
    data: string;
    id: string;
    parentID: string;
}

/**
 * Prepend transaction
 */
export interface PrependTransaction {
    timestamp: number;
    doOperations: PrependOperation[];
    undoOperations: null;
}

/**
 * Response data type for prependBlock
 */
export interface PrependBlockResponse {
    code: number;
    msg: string;
    data: PrependTransaction[];
}

export const schema: EndpointSchema = {
    endpoint: '/api/block/prependBlock',
    summary: 'Prepend blocks to parent',
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
            data: { type: 'string', description: 'Content to prepend' },
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

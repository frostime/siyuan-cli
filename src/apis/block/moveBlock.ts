/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-04-17 22:13:50
 * @Description  :
 * @FilePath     : /src/apis/block/moveBlock.ts
 * @LastEditTime : 2026-04-17 22:15:54
 */
import type { EndpointSchema } from '../../core/schema.js';

/**
 * Move operation
 */
export interface MoveOperation {
    action: string;
    data: null;
    id: string;
    previousID: string;
    parentID: string;
}

/**
 * Move transaction
 */
export interface MoveTransaction {
    timestamp: number;
    doOperations: MoveOperation[];
    undoOperations: null;
}

/**
 * Response data type for moveBlock
 */
export interface MoveBlockResponse {
    code: number;
    msg: string;
    data: MoveTransaction[];
}

export const schema: EndpointSchema = {
    endpoint: '/api/block/moveBlock',
    summary: 'Move a block',
    payload: {
        type: 'object',
        required: ['id', 'previousID', 'parentID'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Block ID to move',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            previousID: {
                type: 'string',
                description:
                    'Previous block ID (empty if moving to first position)',
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
                                required: ['action', 'data', 'id', 'previousID', 'parentID'],
                                properties: {
                                    action: { type: 'string', description: 'operation action type' },
                                    data: { type: 'null', description: 'HTML DOM' },
                                    id: { type: 'string', description: 'Block ID to move' },
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
        operation: 'move'
    },
    guard: {
        payloadTargets: [
            { path: 'id', kind: 'id', access: 'write' },
            { path: 'parentID', kind: 'id', access: 'write' },
            { path: 'previousID', kind: 'id', access: 'write' }
        ]
    }
};

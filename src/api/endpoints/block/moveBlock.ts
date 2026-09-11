/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-04-17 22:13:50
 * @Description  :
 * @FilePath     : /src/api/endpoints/block/moveBlock.ts
 * @LastEditTime : 2026-04-17 22:15:54
 */
import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/moveBlock',
    summary: 'Move a block',
    payload: {
        type: 'object',
        required: ['id', 'parentID'],
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
                    'Optional anchor: the block is placed directly AFTER this block inside parentID. Omit it to insert as the FIRST child of parentID. To move to the END of a parent, pass its current last child (query it with block.getTailChildBlocks). An empty string is rejected by the kernel — omit the flag instead.',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            parentID: {
                type: 'string',
                description:
                    'Target parent container block ID; fixes the destination together with previousID.',
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
        payloadTargets: [
            { path: 'id', kind: 'id', access: 'write' },
            { path: 'parentID', kind: 'id', access: 'write' },
            { path: 'previousID', kind: 'id', access: 'write', skipEmpty: true }
        ]
    },
    formatStrategy: 'transaction'
};

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

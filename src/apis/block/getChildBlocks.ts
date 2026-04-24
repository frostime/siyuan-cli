import type { EndpointSchema } from '../../core/schema.js';

/**
 * Child block info
 */
export interface ChildBlockInfo {
    id: string;
    type: string;
    subType?: string;
}

/**
 * Response data type for getChildBlocks
 */
export interface GetChildBlocksResponse {
    code: number;
    msg: string;
    data: ChildBlockInfo[];
}

export const schema: EndpointSchema = {
    endpoint: '/api/block/getChildBlocks',
    summary: 'Get child block list',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
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
                description: 'sub block list',
                items: {
                    type: 'object',
                    required: ['id', 'type'],
                    properties: {
                        id: { type: 'string', description: 'block ID' },
                        type: { type: 'string', description: 'block type' },
                        subType: { type: 'string', description: 'block subtype' }
                    }
                }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'batch',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }],
        response: {
            itemsAt: '[*]',
            fieldMap: { id: 'id', path: 'path', notebook: 'box' }
        }
    }
};

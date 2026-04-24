import type { EndpointSchema } from '../../core/schema.js';

/**
 * Block attributes (IAL - Inline Attribute List)
 */
export interface BlockAttrs {
    id: string;
    updated?: string;
    [key: string]: string | undefined;
}

/**
 * Response data type for getBlockAttrs
 */
export interface GetBlockAttrsResponse {
    code: number;
    msg: string;
    data: BlockAttrs;
}

export const schema: EndpointSchema = {
    endpoint: '/api/attr/getBlockAttrs',
    summary: 'Get block attributes',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
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
                type: 'object',
                required: ['id'],
                additionalProperties: { type: 'string' },
                properties: {
                    id: { type: 'string', description: 'block ID' },
                    updated: { type: 'string', description: 'last update time' }
                }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    }
};

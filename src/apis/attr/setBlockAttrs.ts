import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for setBlockAttrs
 */
export interface SetBlockAttrsResponse {
    code: number;
    msg: string;
    data: null;
}

export const schema: EndpointSchema = {
    endpoint: '/api/attr/setBlockAttrs',
    summary: 'Set block attributes',
    payload: {
        type: 'object',
        required: ['id', 'attrs'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            attrs: {
                type: 'object',
                description: 'Attribute key-value pairs',
                additionalProperties: true,
                properties: {}
            }
        }
    },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: { type: 'null', description: 'null' }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'update'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    }
};

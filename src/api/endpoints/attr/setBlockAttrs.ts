import type { EndpointSchema } from '@/shared/schema.js';

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

/**
 * Response data type for setBlockAttrs
 */
export interface SetBlockAttrsResponse {
    code: number;
    msg: string;
    data: null;
}

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
        action: 'write',
        domain: 'content',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for setBlockAttrs
 */
export interface SetBlockAttrsResponse {
    code: number;
    msg: string;
    data: null;
}

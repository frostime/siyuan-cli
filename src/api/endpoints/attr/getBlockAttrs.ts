import type { EndpointSchema } from '@/shared/schema.js';

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
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'object'
};

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

import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<{ id: string; kramdown: string }> = {
    endpoint: '/api/block/getBlockKramdown',
    summary: 'Get block Kramdown content',
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
        action: 'read',
        domain: 'content',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    },
    format: ({ responseData }) => responseData.kramdown
};

/**
 * Response data type for getBlockKramdown
 */
export interface GetBlockKramdownResponse {
    code: number;
    msg: string;
    data: {
        id: string;
        kramdown: string;
    };
}

import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/getBlockDOM',
    summary: 'Get block DOM content',
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
    }
};

/**
 * Response data type for getBlockDOM
 */
export interface GetBlockDOMResponse {
    code: number;
    msg: string;
    data: {
        id: string;
        dom: string;
    };
}

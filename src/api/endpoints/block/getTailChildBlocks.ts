import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/getTailChildBlocks',
    summary: 'Get tail child blocks',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Parent block or document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            n: {
                type: 'integer',
                default: 7,
                description: 'Number of tail child blocks to return; kernel treats values below 1 as 7'
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
    formatStrategy: 'records'
};

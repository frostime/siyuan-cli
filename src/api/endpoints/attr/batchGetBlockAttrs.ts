import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/attr/batchGetBlockAttrs',
    summary: 'Batch get block attributes',
    payload: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
            ids: {
                type: 'array',
                description: 'Block IDs',
                items: {
                    type: 'string',
                    pattern: '^\\d{14}-[0-9a-z]{7}$'
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
    cli: {
        allowSource: { ids: ['literal', 'file', 'stdin'] },
        examples: [
            {
                command: 'siyuan api attr.batchGetBlockAttrs --ids @file:./ids.json',
                description: 'ids.json contains an array of block IDs'
            }
        ]
    },
    guard: {
        payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'object'
};

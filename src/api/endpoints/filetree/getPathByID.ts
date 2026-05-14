import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/getPathByID',
    summary: 'Get storage path by ID',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document or block ID',
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
    formatStrategy: 'direct'
};

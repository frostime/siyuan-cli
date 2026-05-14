import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/removeDocByID',
    summary: 'Remove document by ID',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
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

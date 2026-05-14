import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/moveDocsByID',
    summary: 'Move documents by ID',
    payload: {
        type: 'object',
        required: ['fromIDs', 'toID'],
        additionalProperties: false,
        properties: {
            fromIDs: {
                type: 'array',
                description: 'Source document IDs',
                items: { type: 'string', pattern: '^\\d{14}-[0-9a-z]{7}$' }
            },
            toID: {
                type: 'string',
                description: 'Target document ID or notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        action: 'write',
        domain: 'content',
        cardinality: 'batch',
    },
    guard: {
        payloadTargets: [
            { path: 'fromIDs[*]', kind: 'id', access: 'write' },
            { path: 'toID', kind: 'id', access: 'write' }
        ]
    },
    formatStrategy: 'transaction'
};

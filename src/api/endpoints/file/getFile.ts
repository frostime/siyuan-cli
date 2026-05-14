import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/file/getFile',
    summary: 'Get file under workspace directory',
    payload: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: {
            path: { type: 'string', description: 'File path under workspace' }
        }
    },
    classification: {
        action: 'read',
        domain: 'storage',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'read' }
        ]
    },
    formatStrategy: 'json'
};

import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/getHPathByPath',
    summary: 'Get human-readable path by path',
    payload: {
        type: 'object',
        required: ['notebook', 'path'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            path: { type: 'string', description: 'Document path' }
        }
    },
    classification: {
        action: 'read',
        domain: 'content',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'read' },
            { path: 'path', kind: 'path', access: 'read' }
        ]
    },
    formatStrategy: 'direct'
};

/**
 * Response data type for getHPathByPath
 */
export interface GetHPathByPathResponse {
    code: number;
    msg: string;
    data: string;
}

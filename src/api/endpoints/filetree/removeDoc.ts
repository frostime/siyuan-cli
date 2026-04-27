import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/removeDoc',
    summary: 'Remove document',
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
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'delete'
    },
    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'write' },
            { path: 'path', kind: 'path', access: 'write' }
        ]
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for removeDoc
 */
export interface RemoveDocResponse {
    code: number;
    msg: string;
    data: null;
}

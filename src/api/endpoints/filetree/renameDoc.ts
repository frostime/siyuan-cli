import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/renameDoc',
    summary: 'Rename document',
    payload: {
        type: 'object',
        required: ['notebook', 'path', 'title'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            path: { type: 'string', description: 'Document path' },
            title: { type: 'string', description: 'New title' }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'move'
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
 * Response data type for renameDoc
 */
export interface RenameDocResponse {
    code: number;
    msg: string;
    data: null;
}

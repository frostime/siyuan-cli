import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/notebook/renameNotebook',
    summary: 'Rename a notebook',
    payload: {
        type: 'object',
        required: ['notebook', 'name'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            name: { type: 'string', description: 'New notebook name' }
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
            { path: 'notebook', kind: 'notebook', access: 'write' }
        ]
    }
};

/**
 * Response data type for renameNotebook
 */
export interface RenameNotebookResponse {
    code: number;
    msg: string;
    data: null;
}

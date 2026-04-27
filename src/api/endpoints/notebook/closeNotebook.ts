import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/notebook/closeNotebook',
    summary: 'Close a notebook',
    payload: {
        type: 'object',
        required: ['notebook'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'update'
    },
    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'write' }
        ]
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for closeNotebook
 */
export interface CloseNotebookResponse {
    code: number;
    msg: string;
    data: null;
}

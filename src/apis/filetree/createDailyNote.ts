import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for createDailyNote
 */
export interface CreateDailyNoteResponse {
    code: number;
    msg: string;
    data: {
        id: string;
    };
}

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/createDailyNote',
    summary: "Create or get today's daily note for a notebook",
    payload: {
        type: 'object',
        required: ['notebook'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            app: { type: 'string', description: 'Optional app id' }
        }
    },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string', description: 'document block ID' }
                }
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'create'
    },
    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'write' }
        ]
    }
};

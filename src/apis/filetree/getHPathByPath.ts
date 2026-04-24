import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for getHPathByPath
 */
export interface GetHPathByPathResponse {
    code: number;
    msg: string;
    data: string;
}

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: { type: 'string', description: 'human readable path' }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'read' },
            { path: 'path', kind: 'path', access: 'read' }
        ]
    }
};

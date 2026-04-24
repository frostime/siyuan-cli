import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for renameDoc
 */
export interface RenameDocResponse {
    code: number;
    msg: string;
    data: null;
}

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
                description: '笔记本 ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            path: { type: 'string', description: '文档 path' },
            title: { type: 'string', description: '新标题' }
        }
    },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: { type: 'null', description: 'null' }
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
    }
};

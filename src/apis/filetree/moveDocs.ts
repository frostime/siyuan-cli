import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for moveDocs
 */
export interface MoveDocsResponse {
    code: number;
    msg: string;
    data: null;
}

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/moveDocs',
    summary: 'Move documents by path',
    payload: {
        type: 'object',
        required: ['fromPaths', 'toNotebook', 'toPath'],
        additionalProperties: false,
        properties: {
            fromPaths: {
                type: 'array',
                description: 'Source document paths',
                items: { type: 'string' }
            },
            toNotebook: {
                type: 'string',
                description: 'Target notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            toPath: { type: 'string', description: 'Target path' }
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
        scope: 'batch',
        operation: 'move'
    },
    guard: {
        payloadTargets: [
            { path: 'fromPaths[*]', kind: 'path', access: 'write' },
            { path: 'toNotebook', kind: 'notebook', access: 'write' },
            { path: 'toPath', kind: 'path', access: 'write' }
        ]
    }
};

import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for renameFile
 */
export interface RenameFileResponse {
    code: number;
    msg: string;
    data: null;
}

export const schema: EndpointSchema = {
    endpoint: '/api/file/renameFile',
    summary: 'Rename file under workspace directory',
    payload: {
        type: 'object',
        required: ['path', 'newPath'],
        additionalProperties: false,
        properties: {
            path: { type: 'string', description: 'Current file path' },
            newPath: { type: 'string', description: 'New file path' }
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
        surface: 'workspace',
        scope: 'single',
        operation: 'move'
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'write' },
            { path: 'newPath', kind: 'workspace-path', access: 'write' }
        ]
    }
};

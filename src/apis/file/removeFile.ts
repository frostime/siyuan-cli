import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for removeFile
 */
export interface RemoveFileResponse {
    code: number;
    msg: string;
    data: null;
}

export const schema: EndpointSchema = {
    endpoint: '/api/file/removeFile',
    summary: 'Remove file under workspace directory',
    payload: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: {
            path: { type: 'string', description: 'File path under workspace' }
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
        operation: 'delete'
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'write' }
        ]
    }
};

import type { EndpointSchema } from '../../../shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/file/putFile',
    summary: 'Put file under workspace directory',
    payload: {
        type: 'object',
        required: ['path', 'file'],
        additionalProperties: false,
        properties: {
            path: { type: 'string', description: 'File path under workspace' },
            file: {
                type: 'string',
                description: 'Base64 encoded file content or file path'
            },
            isDir: {
                type: 'boolean',
                description: 'Whether the path is a directory',
                default: false
            },
            modTime: {
                type: 'integer',
                description: 'File modification timestamp'
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'workspace',
        scope: 'single',
        operation: 'update'
    },
    cli: {
        // "file" conflicts with the global --file flag (load JSON payload from file).
        // Pass the file content via --json '{ "path": "...", "file": "..." }' instead.
        skipFields: ['file']
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'write' }
        ]
    }
};

/**
 * Response data type for putFile
 */
export interface PutFileResponse {
    code: number;
    msg: string;
    data: null;
}

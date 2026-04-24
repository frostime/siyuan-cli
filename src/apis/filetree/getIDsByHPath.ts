import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for getIDsByHPath
 */
export interface GetIDsByHPathResponse {
    code: number;
    msg: string;
    data: string[];
}

// Phase 6 correction: local draft schema used `paths: string[]`, but upstream SDK accepts a single `path: string` hpath input.
export const schema: EndpointSchema = {
    endpoint: '/api/filetree/getIDsByHPath',
    summary: 'Get document IDs by human-readable path',
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
            path: { type: 'string', description: 'Human-readable path (hpath)' }
        }
    },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'array',
                description: 'document block ID list',
                items: { type: 'string', description: 'document ID' }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'batch',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'notebook', kind: 'notebook', access: 'read' }]
        // `path` here is hpath, not SiYuan id-based path. Current ResourceKind cannot express hpath precisely.
    }
};

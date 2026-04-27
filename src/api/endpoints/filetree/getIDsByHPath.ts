import type { EndpointSchema } from '../../../shared/schema.js';

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

/**
 * Response data type for getIDsByHPath
 */
export interface GetIDsByHPathResponse {
    code: number;
    msg: string;
    data: string[];
}

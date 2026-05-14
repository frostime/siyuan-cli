import type { EndpointSchema } from '@/shared/schema.js';

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
    classification: {
        action: 'write',
        domain: 'storage',
        concerns: ['filesystem'],
        cardinality: 'single'
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'write' }
        ]
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for removeFile
 */
export interface RemoveFileResponse {
    code: number;
    msg: string;
    data: null;
}

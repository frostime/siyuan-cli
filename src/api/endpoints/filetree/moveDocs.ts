import type { EndpointSchema } from '@/shared/schema.js';

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
    classification: {
        action: 'write',
        domain: 'content',
        cardinality: 'batch',
    },
    guard: {
        payloadTargets: [
            { path: 'fromPaths[*]', kind: 'path', access: 'write' },
            { path: 'toNotebook', kind: 'notebook', access: 'write' },
            { path: 'toPath', kind: 'path', access: 'write' }
        ]
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for moveDocs
 */
export interface MoveDocsResponse {
    code: number;
    msg: string;
    data: null;
}

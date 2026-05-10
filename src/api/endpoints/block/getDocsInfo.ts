import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/getDocsInfo',
    summary: 'Batch get document information by block or document IDs',
    payload: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
            ids: {
                type: 'array',
                description: 'Block or document IDs',
                items: {
                    type: 'string',
                    pattern: '^\\d{14}-[0-9a-z]{7}$'
                }
            },
            refCount: {
                type: 'boolean',
                default: false,
                description: 'Include reference count metadata'
            },
            av: {
                type: 'boolean',
                default: false,
                description: 'Include database/attribute-view metadata'
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'batch',
        operation: 'inspect'
    },
    cli: { allowSource: { ids: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'records'
};

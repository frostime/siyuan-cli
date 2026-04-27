import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/unfoldBlock',
    summary: 'Unfold a block',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'update'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for unfoldBlock
 */
export interface UnfoldBlockResponse {
    code: number;
    msg: string;
    data: null;
}

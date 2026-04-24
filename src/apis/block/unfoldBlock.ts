import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for unfoldBlock
 */
export interface UnfoldBlockResponse {
    code: number;
    msg: string;
    data: null;
}

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
        scope: 'single',
        operation: 'update'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    }
};

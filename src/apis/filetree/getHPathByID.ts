import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for getHPathByID
 */
export interface GetHPathByIDResponse {
    code: number;
    msg: string;
    data: string;
}

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/getHPathByID',
    summary: 'Get hpath by document/block ID',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document or block ID',
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
            data: { type: 'string', description: 'human readable path' }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    }
};

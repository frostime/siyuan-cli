import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for getBlockDOM
 */
export interface GetBlockDOMResponse {
    code: number;
    msg: string;
    data: {
        id: string;
        dom: string;
    };
}

export const schema: EndpointSchema = {
    endpoint: '/api/block/getBlockDOM',
    summary: 'Get block DOM content',
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
            data: {
                type: 'object',
                required: ['id', 'dom'],
                properties: {
                    id: { type: 'string', description: 'Block ID' },
                    dom: { type: 'string', description: 'HTML DOM string' }
                }
            }
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

import type { EndpointSchema } from '../../../shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/getBlockInfo',
    summary: 'Get block information',
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
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    }
};

/**
 * Response data type for getBlockInfo
 */
export interface GetBlockInfoResponse {
    code: number;
    msg: string;
    data: {
        box: string;
        path: string;
        rootChildID: string;
        rootID: string;
        rootIcon: string;
        rootTitle: string;
    };
}

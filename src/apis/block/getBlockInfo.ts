import type { EndpointSchema } from '../../core/schema.js';

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['box', 'path', 'rootChildID', 'rootID', 'rootIcon', 'rootTitle'],
                properties: {
                    box: { type: 'string', description: 'Notebook ID' },
                    path: { type: 'string', description: 'Document path' },
                    rootChildID: { type: 'string', description: 'Block ID without parent block' },
                    rootID: { type: 'string', description: 'Document block ID' },
                    rootIcon: { type: 'string', description: 'Document icon' },
                    rootTitle: { type: 'string', description: 'Document title' }
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

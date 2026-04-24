import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for pushErrMsg
 */
export interface PushErrMsgResponse {
    code: number;
    msg: string;
    data: {
        id: string;
    };
}

export const schema: EndpointSchema = {
    endpoint: '/api/notification/pushErrMsg',
    summary: 'Push error message to SiYuan interface',
    payload: {
        type: 'object',
        required: ['msg'],
        additionalProperties: false,
        properties: {
            msg: { type: 'string', description: 'Error message content' },
            timeout: {
                type: 'integer',
                description: 'Display duration (milliseconds)'
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
                required: ['id'],
                properties: {
                    id: { type: 'string', description: 'message ID' }
                }
            }
        }
    },
    classification: {
        mode: 'invoke',
        surface: 'runtime',
        scope: 'single',
        operation: 'control',
        // UI-only notification; affects runtime UX but does not alter data or durable state.
        riskOverride: 'safe'
    },
    cli: {
        primary: 'msg',
        allowSource: { msg: ['literal', 'file', 'stdin'] }
    }
};

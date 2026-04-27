import type { EndpointSchema } from '../../../shared/schema.js';

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

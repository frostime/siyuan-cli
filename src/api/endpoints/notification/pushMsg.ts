import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/notification/pushMsg',
    summary: 'Push message to SiYuan interface',
    payload: {
        type: 'object',
        required: ['msg'],
        additionalProperties: false,
        properties: {
            msg: { type: 'string', description: 'Message content' },
            timeout: {
                type: 'integer',
                description: 'Display duration (milliseconds)'
            }
        }
    },
    classification: {
        action: 'invoke',
        domain: 'ui',
        concerns: ['notify'],
        cardinality: 'single'
    },
    cli: {
        primary: 'msg',
        allowSource: { msg: ['literal', 'file', 'stdin'] }
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for pushMsg
 */
export interface PushMsgResponse {
    code: number;
    msg: string;
    data: {
        id: string;
    };
}

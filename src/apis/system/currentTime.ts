import type { EndpointSchema } from '../../core/schema.js';

export const schema: EndpointSchema<number> = {
    endpoint: '/api/system/currentTime',
    summary: 'Get current system time',
    payload: { type: 'object', properties: {} },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect'
    },
    format: ({ responseData }) => String(responseData)
};

/**
 * Response data type for current time
 */
export interface CurrentTimeResponse {
    code: number;
    msg: string;
    data: number;
}

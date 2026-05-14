import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<number> = {
    endpoint: '/api/system/currentTime',
    summary: 'Get current system time',
    payload: { type: 'object', properties: {} },
    classification: {
        action: 'read',
        domain: 'meta',
        cardinality: 'single',
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

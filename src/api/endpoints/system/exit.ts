import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/system/exit',
    summary: 'Exit SiYuan kernel',
    payload: { type: 'object', properties: {} },
    classification: {
        action: 'invoke',
        domain: 'runtime',
        concerns: ['process-exit'],
        cardinality: 'single'
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for exit
 */
export interface ExitResponse {
    code: number;
    msg: string;
    data: unknown;
}

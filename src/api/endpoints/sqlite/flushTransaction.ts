import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/sqlite/flushTransaction',
    summary: 'Flush SQLite transaction',
    payload: { type: 'object', properties: {} },
    classification: {
        action: 'invoke',
        domain: 'runtime',
        concerns: ['high-load'],
        cardinality: 'single'
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for flushTransaction
 */
export interface FlushTransactionResponse {
    code: number;
    msg: string;
    data: null;
}

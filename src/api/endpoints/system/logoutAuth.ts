import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/system/logoutAuth',
    summary: 'Logout authentication',
    payload: { type: 'object', properties: {} },
    classification: {
        action: 'invoke',
        domain: 'runtime',
        cardinality: 'single'
    },
    formatStrategy: 'transaction'
};

/**
 * Response data type for logoutAuth
 */
export interface LogoutAuthResponse {
    code: number;
    msg: string;
    data: null;
}

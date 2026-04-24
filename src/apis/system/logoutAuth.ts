import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for logoutAuth
 */
export interface LogoutAuthResponse {
    code: number;
    msg: string;
    data: null;
}

export const schema: EndpointSchema = {
    endpoint: '/api/system/logoutAuth',
    summary: 'Logout authentication',
    payload: { type: 'object', properties: {} },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: { type: 'null', description: 'null' }
        }
    },
    classification: {
        mode: 'invoke',
        surface: 'runtime',
        scope: 'single',
        operation: 'control',
        // Invalidates the current session but does not destroy workspace/content data.
        riskOverride: 'sensitive'
    }
};

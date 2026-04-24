import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for boot progress
 */
export interface BootProgressResponse {
    code: number;
    msg: string;
    data: {
        details: string;
        progress: number;
    };
}

export const schema: EndpointSchema = {
    endpoint: '/api/system/bootProgress',
    summary: 'Get SiYuan boot progress (commonly used in Docker scenarios)',
    payload: { type: 'object', properties: {} },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['details', 'progress'],
                properties: {
                    details: { type: 'string', description: 'status details' },
                    progress: { type: 'integer', description: 'booting progress (0-100)' }
                }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect'
    }
};

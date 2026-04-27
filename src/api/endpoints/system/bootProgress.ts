import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/system/bootProgress',
    summary: 'Get SiYuan boot progress (commonly used in Docker scenarios)',
    payload: { type: 'object', properties: {} },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect'
    },
    formatStrategy: 'json'
};

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

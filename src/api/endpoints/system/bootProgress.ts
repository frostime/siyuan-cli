import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/system/bootProgress',
    summary: 'Get SiYuan boot progress (commonly used in Docker scenarios)',
    payload: { type: 'object', properties: {} },
    classification: {
        action: 'read',
        domain: 'meta',
        cardinality: 'single',
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

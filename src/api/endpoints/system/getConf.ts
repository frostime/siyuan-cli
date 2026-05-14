import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/system/getConf',
    summary: 'Get system configuration',
    payload: { type: 'object', properties: {} },
    classification: {
        action: 'read',
        domain: 'config',
        cardinality: 'single'
    },
    formatStrategy: 'json'
};

/**
 * Response data type for getConf
 * Note: conf object is complex and abbreviated here
 */
export interface GetConfResponse {
    code: number;
    msg: string;
    data: {
        start: boolean;
        isPublish: boolean;
        conf: Record<string, unknown>;
    };
}

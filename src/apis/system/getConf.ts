import type { EndpointSchema } from '../../core/schema.js';

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

export const schema: EndpointSchema = {
    endpoint: '/api/system/getConf',
    summary: 'Get system configuration',
    payload: { type: 'object', properties: {} },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['start', 'isPublish', 'conf'],
                properties: {
                    start: { type: 'boolean', description: 'Whether the UI is not loaded' },
                    isPublish: { type: 'boolean', description: 'Whether in publish mode' },
                    conf: { type: 'object', description: 'Full configuration object' }
                }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect',
        // Returns full system configuration; more sensitive than ordinary meta reads.
        riskOverride: 'sensitive'
    }
};

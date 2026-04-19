import type { EndpointSchema } from '../../core/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/network/forwardProxy',
    summary: 'Forward proxy request',
    payload: {
        type: 'object',
        required: ['url'],
        additionalProperties: false,
        properties: {
            url: { type: 'string', description: 'Target URL' },
            method: {
                type: 'string',
                description: 'HTTP method',
                default: 'GET'
            },
            headers: {
                type: 'object',
                description: 'Request headers',
                additionalProperties: true
            },
            body: { type: 'string', description: 'Request body' },
            timeout: {
                type: 'integer',
                description: 'Request timeout (seconds)',
                default: 30
            }
        }
    },
    classification: {
        mode: 'invoke',
        surface: 'network',
        scope: 'single',
        operation: 'control'
        // Critical by fallback: this can drive arbitrary outbound requests through the kernel.
    }
};

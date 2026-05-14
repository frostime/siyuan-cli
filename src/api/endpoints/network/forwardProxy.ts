import type { EndpointSchema } from '@/shared/schema.js';

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
        action: 'invoke',
        domain: 'network',
        concerns: ['network-request'],
        cardinality: 'single'
    },
    formatStrategy: 'object'
};

/**
 * Response headers
 */
export interface ResponseHeaders {
    [key: string]: string[];
}

/**
 * Response data type for forwardProxy
 */
export interface ForwardProxyResponse {
    code: number;
    msg: string;
    data: {
        url: string;
        status: number;
        elapsed: number;
        contentType: string;
        headers: ResponseHeaders;
        body: string;
        bodyEncoding: string;
    };
}

import type { EndpointSchema } from '../../core/schema.js';

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['url', 'status', 'elapsed', 'contentType', 'headers', 'body', 'bodyEncoding'],
                properties: {
                    url: { type: 'string', description: 'URL to request' },
                    status: { type: 'integer', description: 'HTTP status code' },
                    elapsed: { type: 'integer', description: 'response elapsed' },
                    contentType: { type: 'string', description: 'response content-type' },
                    headers: {
                        type: 'object',
                        additionalProperties: { type: 'array', items: { type: 'string' } },
                        description: 'response headers'
                    },
                    body: { type: 'string', description: 'response body' },
                    bodyEncoding: { type: 'string', description: 'response body encoding' }
                }
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

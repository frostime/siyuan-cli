import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/template/render',
    summary: 'Render a template',
    payload: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: {
            path: { type: 'string', description: 'Template file path' }
        }
    },
    classification: {
        action: 'read',
        domain: 'storage',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'read' }
        ]
    },
    formatStrategy: 'object'
};

/**
 * Response data type for render
 */
export interface RenderTemplateResponse {
    code: number;
    msg: string;
    data: {
        path: string;
        content: string;
    };
}

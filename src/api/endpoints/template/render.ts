import type { EndpointSchema } from '../../../shared/schema.js';

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
        mode: 'read',
        surface: 'workspace',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'read' }
        ]
    }
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

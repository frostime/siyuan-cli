import type { EndpointSchema } from '../../core/schema.js';

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['path', 'content'],
                properties: {
                    path: { type: 'string', description: 'absolute path of Kramdown template file' },
                    content: { type: 'string', description: 'DOM string of template rendering result' }
                }
            }
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

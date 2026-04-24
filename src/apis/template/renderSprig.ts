import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for renderSprig
 */
export interface RenderSprigResponse {
    code: number;
    msg: string;
    data: string;
}

export const schema: EndpointSchema = {
    endpoint: '/api/template/renderSprig',
    summary: 'Render Sprig template',
    payload: {
        type: 'object',
        required: ['template'],
        additionalProperties: false,
        properties: {
            template: { type: 'string', description: 'Sprig template string' }
        }
    },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: { type: 'string', description: 'result of rendering the Sprig template' }
        }
    },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect'
    },
    cli: {
        primary: 'template',
        allowSource: { template: ['literal', 'file', 'stdin'] }
    }
};

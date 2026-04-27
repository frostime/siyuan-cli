import type { EndpointSchema } from '../../../shared/schema.js';

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

/**
 * Response data type for renderSprig
 */
export interface RenderSprigResponse {
    code: number;
    msg: string;
    data: string;
}

import type { EndpointSchema } from '../../core/schema.js';

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

import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for exportMdContent
 */
export interface ExportMdContentResponse {
    code: number;
    msg: string;
    data: {
        content: string;
        hPath: string;
    };
}

export const schema: EndpointSchema = {
    endpoint: '/api/export/exportMdContent',
    summary: 'Export document Markdown content',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
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
                required: ['content', 'hPath'],
                properties: {
                    content: { type: 'string', description: 'Markdown content' },
                    hPath: { type: 'string', description: 'human friendly path' }
                }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    }
};

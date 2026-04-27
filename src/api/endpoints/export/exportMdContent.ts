import type { EndpointSchema } from '@/shared/schema.js';

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
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'object'
};

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

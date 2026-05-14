import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/export/exportResources',
    summary: 'Export files and folders as ZIP',
    payload: {
        type: 'object',
        required: ['paths'],
        additionalProperties: false,
        properties: {
            paths: {
                type: 'array',
                description: 'Resource paths to export',
                items: { type: 'string' }
            },
            name: { type: 'string', description: 'Export file name' }
        }
    },
    classification: {
        action: 'read',
        domain: 'storage',
        cardinality: 'batch',
    },
    guard: {
        payloadTargets: [
            { path: 'paths[*]', kind: 'workspace-path', access: 'read' }
        ]
    },
    formatStrategy: 'object'
};

/**
 * Response data type for exportResources
 */
export interface ExportResourcesResponse {
    code: number;
    msg: string;
    data: {
        path: string;
    };
}

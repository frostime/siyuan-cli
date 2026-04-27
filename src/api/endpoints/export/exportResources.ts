import type { EndpointSchema } from '../../core/schema.js';

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
        mode: 'read',
        surface: 'workspace',
        scope: 'batch',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [
            { path: 'paths[*]', kind: 'workspace-path', access: 'read' }
        ]
    }
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

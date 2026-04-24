import type { EndpointSchema } from '../../core/schema.js';

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['path'],
                properties: {
                    path: { type: 'string', description: 'path of exported ZIP file' }
                }
            }
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

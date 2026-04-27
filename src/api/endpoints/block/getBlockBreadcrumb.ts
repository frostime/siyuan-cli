import type { EndpointSchema } from '../../../shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/getBlockBreadcrumb',
    summary: 'Get block breadcrumb path',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Block ID',
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
    }
};

/**
 * Breadcrumb item
 */
export interface BreadcrumbItem {
    id: string;
    name: string;
    type: string;
    subType: string;
    children: null;
}

/**
 * Response data type for getBlockBreadcrumb
 */
export interface GetBlockBreadcrumbResponse {
    code: number;
    msg: string;
    data: BreadcrumbItem[];
}

import type { EndpointSchema } from '../../core/schema.js';

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'array',
                description: 'breadcrumb item list',
                items: {
                    type: 'object',
                    required: ['id', 'name', 'type', 'subType', 'children'],
                    properties: {
                        id: { type: 'string', description: 'Block ID' },
                        name: { type: 'string', description: 'Block text content' },
                        type: { type: 'string', description: 'Block type' },
                        subType: { type: 'string', description: 'Block subtype' },
                        children: { type: 'null', description: 'Block children' }
                    }
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

import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<DocOutlineItem[]> = {
    endpoint: '/api/outline/getDocOutline',
    summary: 'Get document outline',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            preview: {
                type: 'boolean',
                default: false,
                description: 'Whether to return preview-mode outline'
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'content',
        cardinality: 'single'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'json'
};

export interface DocOutlineBlock {
    id: string;
    content?: string;
    name?: string;
    subType?: string;
    blocks?: DocOutlineBlock[];
    [key: string]: unknown;
}

export interface DocOutlineItem {
    id: string;
    name?: string;
    content?: string;
    subType?: string;
    blocks?: DocOutlineBlock[];
    [key: string]: unknown;
}

export interface GetDocOutlineResponse {
    code: number;
    msg: string;
    data: DocOutlineItem[];
}

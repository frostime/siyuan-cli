import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<TailChildBlock[]> = {
    endpoint: '/api/block/getTailChildBlocks',
    summary: 'Get tail child blocks',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Parent block or document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            n: {
                type: 'integer',
                default: 7,
                description: 'Number of tail child blocks to return; kernel treats values below 1 as 7'
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'content',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }],
        response: {
            itemsAt: '[*]',
            fieldMap: { id: 'id' }
        }
    },
    formatStrategy: 'records'
};

export interface TailChildBlock {
    id: string;
    type?: string;
    subType?: string;
    content?: string;
    markdown?: string;
    [key: string]: unknown;
}

export interface GetTailChildBlocksResponse {
    code: number;
    msg: string;
    data: TailChildBlock[];
}

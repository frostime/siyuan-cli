import { filterSiblingIdFields } from '@/api/response-guards.js';
import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<BlockSiblingIDs> = {
    endpoint: '/api/block/getBlockSiblingID',
    summary: 'Get parent, previous, and next sibling IDs for a block',
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
        action: 'read',
        domain: 'meta',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }],
        filterResponse: async (response, engine, context) =>
            await filterSiblingIdFields(response, engine, context)
    },
    formatStrategy: 'object'
};

export interface BlockSiblingIDs {
    parent: string;
    previous: string;
    next: string;
}

export interface GetBlockSiblingIDResponse {
    code: number;
    msg: string;
    data: BlockSiblingIDs;
}

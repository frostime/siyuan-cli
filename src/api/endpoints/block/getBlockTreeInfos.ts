import { filterIdKeyedMap } from '@/api/response-guards.js';
import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<GetBlockTreeInfosData> = {
    endpoint: '/api/block/getBlockTreeInfos',
    summary: 'Batch get block tree context information',
    payload: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
            ids: {
                type: 'array',
                description: 'Block IDs',
                items: {
                    type: 'string',
                    pattern: '^\\d{14}-[0-9a-z]{7}$'
                }
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'content',
        cardinality: 'batch',
    },
    cli: { allowSource: { ids: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }],
        filterResponse: async (response, engine, context) =>
            await filterIdKeyedMap(
                response as GetBlockTreeInfosData,
                engine,
                context
            )
    },
    formatStrategy: 'object'
};

export type GetBlockTreeInfosData = Record<string, BlockTreeInfo>;

export interface BlockTreeInfo {
    id?: string;
    type?: string;
    parentID?: string;
    parentType?: string;
    previousID?: string;
    previousType?: string;
    [key: string]: unknown;
}

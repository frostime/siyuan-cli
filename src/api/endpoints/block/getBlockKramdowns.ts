import { filterIdKeyedMap } from '@/api/response-guards.js';
import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<GetBlockKramdownsData> = {
    endpoint: '/api/block/getBlockKramdowns',
    summary: 'Batch get block Kramdown content',
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
            },
            mode: {
                type: 'string',
                enum: ['md', 'textmark'],
                default: 'md',
                description: 'Kramdown export mode'
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'content',
        cardinality: 'batch',
    },
    cli: {
        allowSource: { ids: ['literal', 'file', 'stdin'] },
        examples: [
            {
                command: 'siyuan api block.getBlockKramdowns --ids @file:./ids.json',
                description: 'ids.json contains an array of block IDs'
            }
        ]
    },
    guard: {
        payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }],
        filterResponse: async (response, engine, context) =>
            await filterIdKeyedMap(
                response as GetBlockKramdownsData,
                engine,
                context
            )
    },
    format: ({ responseData }) => formatGetBlockKramdowns(responseData)
};

export type GetBlockKramdownsData = Record<string, string>;

export interface GetBlockKramdownsResponse {
    code: number;
    msg: string;
    data: GetBlockKramdownsData;
}

function formatGetBlockKramdowns(data: GetBlockKramdownsData): string {
    const entries = Object.entries(data);
    if (entries.length === 0) return '';
    if (entries.length === 1) return entries[0]![1];

    const hint = 'SYSTEM HINT: split this output on lines that match /^--- id: [0-9]{14}-[0-9a-z]{7}$/; the content after each splitter is that block\'s Kramdown until the next splitter.';
    const blocks = entries.map(([id, kramdown]) => `--- id: ${id}\n${kramdown}`);
    return [hint, ...blocks].join('\n\n');
}

import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
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
        mode: 'read',
        surface: 'content',
        scope: 'batch',
        operation: 'inspect'
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
        payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'object'
};

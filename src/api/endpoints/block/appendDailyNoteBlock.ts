import type { EndpointSchema } from '@/shared/schema.js';
import type { BlockTransaction } from './transaction.js';

export const schema: EndpointSchema<BlockTransaction[]> = {
    endpoint: '/api/block/appendDailyNoteBlock',
    summary: 'Append blocks to today\'s daily note',
    payload: {
        type: 'object',
        required: ['notebook', 'data'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            data: { type: 'string', description: 'Content to append' },
            dataType: {
                type: 'string',
                enum: ['markdown', 'dom'],
                default: 'markdown',
                description: 'Content type; use markdown by default'
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'create'
    },
    cli: { allowSource: { data: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'notebook', kind: 'notebook', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

export interface AppendDailyNoteBlockResponse {
    code: number;
    msg: string;
    data: BlockTransaction[];
}

import type { EndpointSchema } from '@/shared/schema.js';
import type { BlockTransaction } from './transaction.js';

const optionalAnchorID = '^(\\d{14}-[0-9a-z]{7})?$';

export const schema: EndpointSchema<BlockTransaction[]> = {
    endpoint: '/api/block/batchInsertBlock',
    summary: 'Batch insert blocks before, after, or as children of specified blocks',
    payload: {
        type: 'object',
        required: ['blocks'],
        additionalProperties: false,
        properties: {
            blocks: {
                type: 'array',
                description: 'Blocks to insert',
                items: {
                    type: 'object',
                    required: ['data', 'dataType'],
                    additionalProperties: false,
                    properties: {
                        data: { type: 'string', description: 'Content to insert' },
                        dataType: {
                            type: 'string',
                            enum: ['markdown', 'dom'],
                            default: 'markdown',
                            description: 'Content type; use markdown by default'
                        },
                        parentID: {
                            type: 'string',
                            description: 'Parent block ID; empty string means unset',
                            pattern: optionalAnchorID
                        },
                        previousID: {
                            type: 'string',
                            description: 'Previous block ID; empty string means unset',
                            pattern: optionalAnchorID
                        },
                        nextID: {
                            type: 'string',
                            description: 'Next block ID; empty string means unset',
                            pattern: optionalAnchorID
                        }
                    }
                }
            }
        }
    },
    classification: {
        action: 'write',
        domain: 'content',
        cardinality: 'batch',
    },
    cli: { allowSource: { blocks: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [
            { path: 'blocks[*].parentID', kind: 'id', access: 'write', skipEmpty: true },
            { path: 'blocks[*].previousID', kind: 'id', access: 'write', skipEmpty: true },
            { path: 'blocks[*].nextID', kind: 'id', access: 'write', skipEmpty: true }
        ]
    },
    formatStrategy: 'transaction'
};

export interface BatchInsertBlockResponse {
    code: number;
    msg: string;
    data: BlockTransaction[];
}

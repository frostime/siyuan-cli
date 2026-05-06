import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/batchUpdateBlock',
    summary: 'Batch update block content in one transaction',
    description:
        'Updates multiple blocks atomically. Prefer dataType="markdown" unless DOM-level editing is explicitly required. Updating a document block replaces its existing child tree before appending the new content.',
    payload: {
        type: 'object',
        required: ['blocks'],
        additionalProperties: false,
        properties: {
            blocks: {
                type: 'array',
                description: 'Block updates to execute atomically',
                items: {
                    type: 'object',
                    required: ['id', 'data', 'dataType'],
                    additionalProperties: false,
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Block ID',
                            pattern: '^\\d{14}-[0-9a-z]{7}$'
                        },
                        data: {
                            type: 'string',
                            description: 'New block content'
                        },
                        dataType: {
                            type: 'string',
                            enum: ['markdown', 'dom'],
                            default: 'markdown',
                            description: 'Content type; use markdown by default'
                        }
                    }
                }
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'batch',
        operation: 'update'
    },
    cli: {
        examples: [
            {
                command:
                    'siyuan api block.batchUpdateBlock --blocks @file:./blocks.json',
                description:
                    'blocks.json contains an array of {id,data,dataType}; use dataType="markdown" by default'
            },
            {
                command:
                    'siyuan api block.batchUpdateBlock --blocks @stdin <<\'EOF\'\n[{"id":"20230315180000-abcdefg","data":"New markdown","dataType":"markdown"}]\nEOF'
            }
        ],
        allowSource: { blocks: ['literal', 'file', 'stdin'] }
    },
    guard: {
        payloadTargets: [{ path: 'blocks[*].id', kind: 'id', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

export interface BatchUpdateBlockItem {
    id: string;
    data: string;
    dataType: 'markdown' | 'dom';
}

export interface BatchUpdateOperation {
    action: string;
    data: string;
    id: string;
}

export interface BatchUpdateTransaction {
    timestamp: number;
    doOperations: BatchUpdateOperation[];
    undoOperations: BatchUpdateOperation[];
}

export interface BatchUpdateBlockResponse {
    code: number;
    msg: string;
    data: BatchUpdateTransaction[] | null;
}

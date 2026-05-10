import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<BatchSetBlockAttrsData> = {
    endpoint: '/api/attr/batchSetBlockAttrs',
    summary: 'Batch set block attributes',
    description:
        'Sets attributes for multiple blocks. Attribute values should be strings; kernel also accepts null to clear attributes.',
    payload: {
        type: 'object',
        required: ['blockAttrs'],
        additionalProperties: false,
        properties: {
            blockAttrs: {
                type: 'array',
                description: 'Attribute updates to apply',
                items: {
                    type: 'object',
                    required: ['id', 'attrs'],
                    additionalProperties: false,
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Block ID',
                            pattern: '^\\d{14}-[0-9a-z]{7}$'
                        },
                        attrs: {
                            type: 'object',
                            description: 'Attribute key-value pairs; null values clear attributes',
                            additionalProperties: true,
                            properties: {}
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
        allowSource: { blockAttrs: ['literal', 'file', 'stdin'] },
        examples: [
            {
                command: 'siyuan api attr.batchSetBlockAttrs --blockAttrs @file:./attrs.json',
                description: 'attrs.json contains an array of {id,attrs}'
            }
        ]
    },
    guard: {
        payloadTargets: [{ path: 'blockAttrs[*].id', kind: 'id', access: 'write' }]
    },
    formatStrategy: 'transaction'
};

export type BatchSetBlockAttrsData = null;

export interface BatchSetBlockAttrsResponse {
    code: number;
    msg: string;
    data: BatchSetBlockAttrsData;
}

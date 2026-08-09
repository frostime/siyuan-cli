import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/history/createDocHistory',
    summary: 'Create kernel history for a document',
    description:
        'Creates a SiYuan kernel history snapshot for the specified document.',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        action: 'write',
        domain: 'content',
        cardinality: 'single'
    },
    minKernelVersion: '3.7.0',
    cli: {
        primary: 'id',
        examples: [
            {
                command:
                    'siyuan-cli api history.createDocHistory 20241016135347-zlrn2cz'
            }
        ]
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }]
    },
    format: () => 'Document history created.'
};

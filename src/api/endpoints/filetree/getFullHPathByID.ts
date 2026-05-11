import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<string> = {
    endpoint: '/api/filetree/getFullHPathByID',
    summary: 'Get full hpath by document/block ID',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document or block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'direct'
};

export interface GetFullHPathByIDResponse {
    code: number;
    msg: string;
    data: string;
}

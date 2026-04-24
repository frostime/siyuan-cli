import type { EndpointSchema } from '../../core/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/block/transferBlockRef',
    summary: 'Transfer block reference',
    payload: {
        type: 'object',
        required: ['fromID', 'toID', 'refIDs'],
        additionalProperties: false,
        properties: {
            fromID: {
                type: 'string',
                description: 'Source block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            toID: {
                type: 'string',
                description: 'Target block ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            refIDs: {
                type: 'array',
                description: 'Reference block IDs to transfer',
                items: { type: 'string', pattern: '^\\d{14}-[0-9a-z]{7}$' }
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'move'
    },
    guard: {
        payloadTargets: [
            { path: 'fromID', kind: 'id', access: 'write' },
            { path: 'toID', kind: 'id', access: 'write' },
            { path: 'refIDs[*]', kind: 'id', access: 'write' }
        ]
    }
};

/**
 * Response data type for transferBlockRef
 */
export interface TransferBlockRefResponse {
    code: number;
    msg: string;
    data: null;
}

import { isRecord } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for getBlockKramdown
 */
export interface GetBlockKramdownResponse {
    code: number;
    msg: string;
    data: {
        id: string;
        kramdown: string;
    };
}

export const schema: EndpointSchema = {
    endpoint: '/api/block/getBlockKramdown',
    summary: 'Get block Kramdown content',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: '块 ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['id', 'kramdown'],
                properties: {
                    id: { type: 'string', description: 'block ID' },
                    kramdown: { type: 'string', description: 'block kramdown text' }
                }
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
    format: ({ result }) => {
        if (typeof result === 'string') return result;
        if (isRecord(result)) {
            const value = result.kramdown ?? result.markdown ?? result.content;
            if (typeof value === 'string') return value;
        }
        return JSON.stringify(result, null, 2);
    }
};

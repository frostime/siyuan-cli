import { isRecord } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';

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
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    },
    format: ({ responseData: result }) => {
        if (typeof result === 'string') return result;
        if (isRecord(result)) {
            const value = result.kramdown ?? result.markdown ?? result.content;
            if (typeof value === 'string') return value;
        }
        return JSON.stringify(result, null, 2);
    }
};

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

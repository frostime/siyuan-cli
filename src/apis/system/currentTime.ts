import { isRecord } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for current time
 */
export interface CurrentTimeResponse {
    code: number;
    msg: string;
    data: number;
}

export const schema: EndpointSchema = {
    endpoint: '/api/system/currentTime',
    summary: 'Get current system time',
    payload: { type: 'object', properties: {} },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: { type: 'integer', description: 'Unix timestamp (millisecond)' }
        }
    },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect'
    },
    format: ({ result }) => {
        if (typeof result === 'string') return result;
        if (typeof result === 'number') return String(result);
        if (isRecord(result)) {
            const value = result.time ?? result.now ?? result.currentTime ?? result.ts;
            if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'bigint'
            ) {
                return String(value);
            }
        }
        return JSON.stringify(result, null, 2);
    }
};

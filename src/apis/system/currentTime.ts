import { isRecord } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/system/currentTime',
    summary: 'Get current system time',
    payload: { type: 'object', properties: {} },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect'
    },
    format: ({ responseData: result }) => {
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

/**
 * Response data type for current time
 */
export interface CurrentTimeResponse {
    code: number;
    msg: string;
    data: number;
}

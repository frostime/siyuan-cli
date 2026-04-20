import { isRecord } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';
export const schema: EndpointSchema = {
    endpoint: '/api/system/version',
    summary: 'Get SiYuan kernel version',
    payload: { type: 'object', properties: {} },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect'
    },
    format: ({ result }) => {
        if (typeof result === 'string') return result;
        if (isRecord(result) && typeof result.ver === 'string') {
            return result.ver;
        }
        return JSON.stringify(result, null, 2);
    }
};

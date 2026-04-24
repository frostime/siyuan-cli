import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for exit
 */
export interface ExitResponse {
    code: number;
    msg: string;
    data: unknown;
}

export const schema: EndpointSchema = {
    endpoint: '/api/system/exit',
    summary: 'Exit SiYuan kernel',
    payload: { type: 'object', properties: {} },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: { description: 'empty object' }
        }
    },
    classification: {
        mode: 'invoke',
        surface: 'runtime',
        scope: 'single',
        operation: 'control',
        // Exits the kernel process; stronger than the default runtime-control risk level.
        riskOverride: 'critical'
    }
};

import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/system/exit',
    summary: 'Exit SiYuan kernel',
    payload: { type: 'object', properties: {} },
    classification: {
        mode: 'invoke',
        surface: 'runtime',
        scope: 'single',
        operation: 'control',
        // Exits the kernel process; stronger than the default runtime-control risk level.
        riskOverride: 'critical'
    }
};

/**
 * Response data type for exit
 */
export interface ExitResponse {
    code: number;
    msg: string;
    data: unknown;
}

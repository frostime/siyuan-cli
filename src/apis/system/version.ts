/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-04-19 18:36:12
 * @Description  :
 * @FilePath     : /src/apis/system/version.ts
 * @LastEditTime : 2026-04-24 17:55:00
 */
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
    format: ({ responseData: result }) => {
        if (typeof result === 'string') return result;
        if (isRecord(result) && typeof result.ver === 'string') {
            return result.ver;
        }
        return JSON.stringify(result, null, 2);
    }
};

/**
 * Response data type for system version
 * Kernel returns: { code: number, msg: string, data: string }
 * where data is the semantic version number (e.g., "2.9.3")
 */
export interface SystemVersionResponse {
    code: number;
    msg: string;
    data: string;
}

/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-04-19 18:36:12
 * @Description  :
 * @FilePath     : /src/api/endpoints/system/version.ts
 * @LastEditTime : 2026-04-24 17:55:00
 */
import type { EndpointSchema } from '../../../shared/schema.js';

export const schema: EndpointSchema<string> = {
    endpoint: '/api/system/version',
    summary: 'Get SiYuan kernel version',
    payload: { type: 'object', properties: {} },
    classification: {
        mode: 'read',
        surface: 'meta',
        scope: 'single',
        operation: 'inspect'
    },
    format: ({ responseData }) => responseData
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

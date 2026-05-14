import { filterResponseObjectById } from '@/api/response-guards.js';
import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<DocInfo | null> = {
    endpoint: '/api/block/getDocInfo',
    summary: 'Get document information by block or document ID',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Block or document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'content',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }],
        filterResponse: async (response, engine, context) =>
            await filterResponseObjectById(response, engine, context)
    },
    formatStrategy: 'object'
};

export interface DocInfo {
    id: string;
    rootID?: string;
    name?: string;
    refCount?: number;
    subFileCount?: number;
    refIDs?: string[] | null;
    ial?: Record<string, string>;
    icon?: string;
    attrViews?: unknown[] | null;
    [key: string]: unknown;
}

export interface GetDocInfoResponse {
    code: number;
    msg: string;
    data: DocInfo | null;
}

import { filterResponseObjectById } from '@/api/response-guards.js';
import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<DuplicateDocData | null> = {
    endpoint: '/api/filetree/duplicateDoc',
    summary: 'Duplicate document',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Source document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'create'
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'write' }],
        filterResponse: async (response, engine, context) =>
            await filterResponseObjectById(response, engine, context)
    },
    formatStrategy: 'object'
};

export interface DuplicateDocData {
    id: string;
    notebook?: string;
    path?: string;
    hPath?: string;
    [key: string]: unknown;
}

export interface DuplicateDocResponse {
    code: number;
    msg: string;
    data: DuplicateDocData | null;
}

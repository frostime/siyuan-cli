import type { EndpointSchema } from '../../core/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/listDocsByPath',
    summary: 'List documents by path',
    payload: {
        type: 'object',
        required: ['notebook', 'path'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            path: {
                type: 'string',
                description: 'SiYuan path (starts with /)'
            },
            sort: { type: 'integer', description: 'Sort method' },
            maxListCount: {
                type: 'integer',
                description: 'Maximum items to return'
            },
            flashcard: {
                type: 'boolean',
                description: 'Include flashcard-related information'
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'batch',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'read' },
            { path: 'path', kind: 'path', access: 'read' }
        ],
        filterResponse: (response, engine) => {
            const r = response as {
                files?: Array<Record<string, unknown>>;
                data?: { files?: Array<Record<string, unknown>>; box?: string };
            };
            const files = r.data?.files ?? r.files ?? [];
            const box = r.data?.box;
            const { kept } = engine.filterItems(files, (f) => ({
                id: typeof f.id === 'string' ? f.id : undefined,
                path: typeof f.path === 'string' ? f.path : undefined,
                notebook: typeof f.box === 'string' ? f.box : box
            }));
            if (r.data?.files) r.data.files = kept;
            else if (r.files) r.files = kept;
            return response;
        }
    }
};

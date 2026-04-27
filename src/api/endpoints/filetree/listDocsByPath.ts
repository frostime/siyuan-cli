import { formatRecords } from '../../../shared/output.js';
import type { EndpointSchema } from '../../../shared/schema.js';

export const schema: EndpointSchema<{
    box?: string;
    path?: string;
    files: DocFileInfo[];
}> = {
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
        filterResponse: async (response, engine) => {
            const r = response as {
                files?: Array<Record<string, unknown>>;
                data?: { files?: Array<Record<string, unknown>>; box?: string };
            };
            const files = r.data?.files ?? r.files ?? [];
            const box = r.data?.box;
            const { kept } = await engine.filterItems(files, (f) => ({
                id: typeof f.id === 'string' ? f.id : undefined,
                path: typeof f.path === 'string' ? f.path : undefined,
                notebook: typeof f.box === 'string' ? f.box : box
            }));
            if (r.data?.files) r.data.files = kept;
            else if (r.files) r.files = kept;
            return response;
        }
    },
    format: ({ responseData }) => {
        const header = [
            responseData.box ? `box=${responseData.box}` : undefined,
            `files=${responseData.files.length}`
        ]
            .filter(Boolean)
            .join(' | ');
        const body = formatRecords(responseData.files, {
            label: 'docs',
            keys: ['id', 'box', 'path', 'hPath', 'name', 'title', 'subFileCount']
        });
        return header ? `${header}\n${body}` : body;
    }
};

/**
 * Document file info
 */
export interface DocFileInfo {
    path: string;
    name: string;
    icon: string;
    name1: string;
    alias: string;
    memo: string;
    bookmark: string;
    id: string;
    count: number;
    size: number;
    hSize: string;
    mtime: number;
    ctime: number;
    hMtime: string;
    hCtime: string;
    sort: number;
    subFileCount: number;
    hidden: boolean;
    newFlashcardCount: number;
    dueFlashcardCount: number;
    flashcardCount: number;
}

/**
 * Response data type for listDocsByPath
 */
export interface ListDocsByPathResponse {
    code: number;
    msg: string;
    data: {
        box: string;
        path: string;
        files: DocFileInfo[];
    };
}

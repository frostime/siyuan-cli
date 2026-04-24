import type { EndpointSchema } from '../../core/schema.js';

/**
 * Document search result item
 */
export interface DocSearchResult {
    box: string;
    boxIcon: string;
    hPath: string;
    path: string;
    flashcardCount?: number;
    newFlashcardCount?: number;
    dueFlashcardCount?: number;
}

/**
 * Response data type for searchDocs
 */
export interface SearchDocsResponse {
    code: number;
    msg: string;
    data: DocSearchResult[];
}

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/searchDocs',
    summary: 'Search documents',
    payload: {
        type: 'object',
        required: ['k'],
        additionalProperties: false,
        properties: {
            k: { type: 'string', description: 'Search keyword' },
            notebook: {
                type: 'string',
                description: 'Notebook ID to search in',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            path: { type: 'string', description: 'Path to search under' }
        }
    },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'array',
                description: 'document info list',
                items: {
                    type: 'object',
                    required: ['box', 'boxIcon', 'hPath', 'path'],
                    properties: {
                        box: { type: 'string', description: 'Document Block ID' },
                        boxIcon: { type: 'string', description: 'Notebook icon' },
                        hPath: { type: 'string', description: 'readable path' },
                        path: { type: 'string', description: 'Directory path' },
                        flashcardCount: { type: 'integer', description: 'flashcard count' },
                        newFlashcardCount: { type: 'integer', description: 'new flashcard count' },
                        dueFlashcardCount: { type: 'integer', description: 'due flashcard count' }
                    }
                }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'batch',
        operation: 'search'
    },
    cli: { primary: 'k' },
    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'read' },
            { path: 'path', kind: 'path', access: 'read' }
        ],
        response: {
            itemsAt: '[*]',
            fieldMap: { path: 'path', notebook: 'box' }
        }
    }
};

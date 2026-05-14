import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/filetree/searchDocs',
    summary: 'Search documents',
    payload: {
        type: 'object',
        required: ['k'],
        additionalProperties: false,
        properties: {
            k: { type: 'string', description: 'Search keyword' }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'global',
        operation: 'search'
    },
    cli: { primary: 'k' },
    guard: {
        response: {
            itemsAt: '[*]',
            fieldMap: { path: 'path', notebook: 'box' }
        }
    },
    formatStrategy: 'records'
};

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

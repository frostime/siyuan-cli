import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/notebook/lsNotebooks',
    summary: 'List all notebooks',
    payload: {
        type: 'object',
        additionalProperties: false,
        properties: {
            flashcard: {
                type: 'boolean',
                description: 'Include flashcard-related information',
                default: false
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'content',
        cardinality: 'global',
    },
    guard: {
        response: {
            itemsAt: 'notebooks[*]',
            fieldMap: { notebook: 'id' }
        }
    },
    formatStrategy: 'records'
};

/**
 * Notebook info in lsNotebooks response
 */
export interface NotebookInfo {
    id: string;
    name: string;
    icon: string;
    sort: number;
    sortMode: number;
    closed: boolean;
    newFlashcardCount: number;
    dueFlashcardCount: number;
    flashcardCount: number;
}

/**
 * Response data type for lsNotebooks
 */
export interface LsNotebooksResponse {
    code: number;
    msg: string;
    data: {
        notebooks: NotebookInfo[];
    };
}

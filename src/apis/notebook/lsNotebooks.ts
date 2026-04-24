import type { EndpointSchema } from '../../core/schema.js';

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['notebooks'],
                properties: {
                    notebooks: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['id', 'name', 'icon', 'sort', 'sortMode', 'closed', 'newFlashcardCount', 'dueFlashcardCount', 'flashcardCount'],
                            properties: {
                                id: { type: 'string', description: 'notebook ID' },
                                name: { type: 'string', description: 'notebook name' },
                                icon: { type: 'string', description: 'notebook icon' },
                                sort: { type: 'integer', description: 'sequence number' },
                                sortMode: { type: 'integer', description: 'document sorting mode' },
                                closed: { type: 'boolean', description: 'notebook open state' },
                                newFlashcardCount: { type: 'integer', description: 'new flashcard count' },
                                dueFlashcardCount: { type: 'integer', description: 'due flashcard count' },
                                flashcardCount: { type: 'integer', description: 'flashcard count' }
                            }
                        }
                    }
                }
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'global',
        operation: 'inspect'
    },
    guard: {
        response: {
            itemsAt: 'notebooks[*]',
            fieldMap: { notebook: 'id' }
        }
    }
};

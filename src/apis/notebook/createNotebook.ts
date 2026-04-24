import type { EndpointSchema } from '../../core/schema.js';

/**
 * Response data type for createNotebook
 */
export interface CreateNotebookResponse {
    code: number;
    msg: string;
    data: {
        notebook: {
            id: string;
            name: string;
            icon: string;
            sort: number;
            sortMode: number;
            closed: boolean;
            newFlashcardCount: number;
            dueFlashcardCount: number;
            flashcardCount: number;
        };
    };
}

export const schema: EndpointSchema = {
    endpoint: '/api/notebook/createNotebook',
    summary: 'Create a new notebook',
    payload: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
            name: { type: 'string', description: 'Notebook name' }
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
                required: ['notebook'],
                properties: {
                    notebook: {
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
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'create'
    },
    cli: {
        primary: 'name',
        allowSource: { name: ['literal'] }
    }
};

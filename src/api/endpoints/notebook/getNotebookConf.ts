import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/notebook/getNotebookConf',
    summary: 'Get notebook configuration',
    payload: {
        type: 'object',
        required: ['notebook'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [{ path: 'notebook', kind: 'notebook', access: 'read' }]
    },
    formatStrategy: 'json'
};

/**
 * Notebook configuration
 */
export interface NotebookConf {
    closed: boolean;
    dailyNoteSavePath: string;
    dailyNoteTemplatePath: string;
    docCreateSaveBox: string;
    docCreateSavePath: string;
    icon: string;
    name: string;
    refCreateSaveBox: string;
    refCreateSavePath: string;
    sort: number;
    sortMode: number;
}

/**
 * Response data type for getNotebookConf
 */
export interface GetNotebookConfResponse {
    code: number;
    msg: string;
    data: {
        box: string;
        conf: NotebookConf;
        name: string;
    };
}

import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema = {
    endpoint: '/api/notebook/setNotebookConf',
    summary: 'Set notebook configuration',
    payload: {
        type: 'object',
        required: ['notebook', 'conf'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            conf: {
                type: 'object',
                description: 'Notebook configuration object',
                additionalProperties: true,
                properties: {}
            }
        }
    },
    classification: {
        action: 'write',
        domain: 'content',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'write' }
        ]
    },
    formatStrategy: 'transaction'
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
 * Response data type for setNotebookConf
 */
export interface SetNotebookConfResponse {
    code: number;
    msg: string;
    data: NotebookConf;
}

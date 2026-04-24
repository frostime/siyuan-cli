import type { EndpointSchema } from '../../core/schema.js';

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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['box', 'conf', 'name'],
                properties: {
                    box: { type: 'string', description: 'notebook ID' },
                    conf: {
                        type: 'object',
                        required: ['closed', 'dailyNoteSavePath', 'dailyNoteTemplatePath', 'docCreateSaveBox', 'docCreateSavePath', 'icon', 'name', 'refCreateSaveBox', 'refCreateSavePath', 'sort', 'sortMode'],
                        properties: {
                            closed: { type: 'boolean', description: 'notebook open state' },
                            dailyNoteSavePath: { type: 'string', description: 'path of new daily note' },
                            dailyNoteTemplatePath: { type: 'string', description: 'template file path' },
                            docCreateSaveBox: { type: 'string', description: 'new document save notebook' },
                            docCreateSavePath: { type: 'string', description: 'new document save location' },
                            icon: { type: 'string', description: 'notebook icon' },
                            name: { type: 'string', description: 'notebook name' },
                            refCreateSaveBox: { type: 'string', description: 'ref create save notebook' },
                            refCreateSavePath: { type: 'string', description: 'ref create save path' },
                            sort: { type: 'integer', description: 'sequence number' },
                            sortMode: { type: 'integer', description: 'document sorting mode' }
                        }
                    },
                    name: { type: 'string', description: 'notebook name' }
                }
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
    }
};

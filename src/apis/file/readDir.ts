import { formatRecordArray } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';

export const schema: EndpointSchema<FileEntry[]> = {
    endpoint: '/api/file/readDir',
    summary: 'List files in directory',
    payload: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: {
            path: {
                type: 'string',
                description: 'Directory path under workspace'
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'workspace',
        scope: 'single',
        operation: 'inspect'
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'read' }
        ]
    },
    format: ({ responseData }) =>
        formatRecordArray(responseData, {
            label: 'entries',
            maxItems: 30,
            keys: ['name', 'isDir', 'size', 'path']
        })
};

/**
 * File or directory entry
 */
export interface FileEntry {
    isDir: boolean;
    isSymlink: boolean;
    name: string;
    updated: number;
}

/**
 * Response data type for readDir
 */
export interface ReadDirResponse {
    code: number;
    msg: string;
    data: FileEntry[];
}

import { formatRecords } from '@/shared/output.js';
import type { EndpointSchema } from '@/shared/schema.js';

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
        action: 'read',
        domain: 'storage',
        cardinality: 'single',
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'read' }
        ]
    },
    format: ({ responseData }) =>
        formatRecords(responseData, {
            label: 'entries',
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

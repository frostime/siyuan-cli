import { formatRecordArray, isRecord } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';

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

export const schema: EndpointSchema = {
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
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'array',
                description: 'file entries',
                items: {
                    type: 'object',
                    required: ['isDir', 'isSymlink', 'name', 'updated'],
                    properties: {
                        isDir: { type: 'boolean', description: 'is directory' },
                        isSymlink: { type: 'boolean', description: 'is symbolic link' },
                        name: { type: 'string', description: 'filename' },
                        updated: { type: 'integer', description: 'last modified time (Unix timestamp)' }
                    }
                }
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
    format: ({ result }) => {
        if (Array.isArray(result)) {
            return formatRecordArray(result, {
                label: 'entries',
                maxItems: 30,
                keys: ['name', 'isDir', 'size', 'path']
            });
        }
        if (isRecord(result) && Array.isArray(result.files)) {
            return formatRecordArray(result.files, {
                label: 'entries',
                maxItems: 30,
                keys: ['name', 'isDir', 'size', 'path']
            });
        }
        return JSON.stringify(result, null, 2);
    }
};

import type { EndpointSchema } from '../../core/schema.js';

/**
 * Upload result data
 */
export interface UploadResult {
    errFiles: string[] | null;
    succMap: Record<string, string>;
}

/**
 * Response data type for upload
 */
export interface UploadResponse {
    code: number;
    msg: string;
    data: UploadResult;
}

export const schema: EndpointSchema = {
    endpoint: '/api/asset/upload',
    summary: 'Upload assets',
    payload: {
        type: 'object',
        required: ['file[]'],
        additionalProperties: false,
        properties: {
            'file[]': {
                type: 'array',
                description: 'Local file paths to upload (multiple allowed)',
                items: { type: 'string' }
            },
            assetsDirPath: {
                type: 'string',
                description: 'Asset save directory',
                default: '/assets/'
            }
        }
    },
    multipart: { fileFields: ['file[]'] },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['errFiles', 'succMap'],
                properties: {
                    errFiles: {
                        oneOf: [
                            { type: 'null', description: 'all uploaded successfully' },
                            { type: 'array', items: { type: 'string' }, description: 'failed filenames' }
                        ]
                    },
                    succMap: {
                        type: 'object',
                        additionalProperties: { type: 'string' },
                        description: 'map of filename to asset reference URL'
                    }
                }
            }
        }
    },
    classification: {
        mode: 'write',
        surface: 'asset',
        scope: 'single',
        operation: 'upload'
    }
};

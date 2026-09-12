import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<string[] | null> = {
    endpoint: '/api/asset/getDocAssets',
    summary: 'List assets referenced by a document',
    description:
        'Walks the document tree and returns every referenced asset path — images, audio, video, iframes, widgets, links and file annotations. Results keep document order and are not de-duplicated, so a repeated asset appears once per reference. Only local `assets/` paths are reported; remote URLs are skipped. Returns `null` when the document references no asset.',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            retainQueryStr: {
                type: 'boolean',
                default: true,
                description:
                    'Keep the query string on each asset path; `?box=<notebook-id>` identifies encrypted notebooks'
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'storage',
        cardinality: 'single'
    },
    cli: {
        primary: 'id',
        examples: [
            {
                command:
                    'siyuan-cli api asset.getDocAssets 20240922152051-7dpjfpv'
            }
        ]
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'direct'
};

/**
 * Response data type for getDocAssets
 */
export interface GetDocAssetsResponse {
    code: number;
    msg: string;
    data: string[] | null;
}

import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<string[] | null> = {
    endpoint: '/api/asset/getDocImageAssets',
    summary: 'List image assets referenced by a document',
    description:
        'Returns the destination of every image node in the document — narrower than `asset.getDocAssets`, but it also keeps remote image URLs. Results keep document order and are not de-duplicated. Returns `null` when the document has no images.',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
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
                    'siyuan-cli api asset.getDocImageAssets 20240922152051-7dpjfpv'
            }
        ]
    },
    guard: {
        payloadTargets: [{ path: 'id', kind: 'id', access: 'read' }]
    },
    formatStrategy: 'direct'
};

/**
 * Response data type for getDocImageAssets
 */
export interface GetDocImageAssetsResponse {
    code: number;
    msg: string;
    data: string[] | null;
}

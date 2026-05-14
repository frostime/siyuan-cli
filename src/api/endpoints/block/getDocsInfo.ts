import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<DocInfo[]> = {
    endpoint: '/api/block/getDocsInfo',
    summary: 'Batch get document information by block or document IDs',
    payload: {
        type: 'object',
        required: ['ids'],
        additionalProperties: false,
        properties: {
            ids: {
                type: 'array',
                description: 'Block or document IDs',
                items: {
                    type: 'string',
                    pattern: '^\\d{14}-[0-9a-z]{7}$'
                }
            },
            refCount: {
                type: 'boolean',
                default: false,
                description: 'Include reference count metadata'
            },
            av: {
                type: 'boolean',
                default: false,
                description: 'Include database/attribute-view metadata'
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'content',
        cardinality: 'batch',
    },
    cli: { allowSource: { ids: ['literal', 'file', 'stdin'] } },
    guard: {
        payloadTargets: [{ path: 'ids[*]', kind: 'id', access: 'read' }],
        response: {
            itemsAt: '[*]',
            fieldMap: { id: 'id' }
        }
    },
    formatStrategy: 'records'
};

export interface DocInfo {
    id: string;
    rootID?: string;
    name?: string;
    refCount?: number;
    subFileCount?: number;
    refIDs?: string[] | null;
    ial?: Record<string, string>;
    icon?: string;
    attrViews?: unknown[] | null;
    [key: string]: unknown;
}

export interface GetDocsInfoResponse {
    code: number;
    msg: string;
    data: DocInfo[];
}
